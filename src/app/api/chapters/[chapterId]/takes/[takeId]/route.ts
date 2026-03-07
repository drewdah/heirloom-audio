import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteDriveFile } from "@/lib/google-drive";
import { unlink } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

// PATCH /api/chapters/[chapterId]/takes/[takeId] — update region/duration
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string; takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId, takeId } = await params;
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });
  if (!take || take.chapter.book.userId !== session.user.id || take.chapterId !== chapterId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, number> = {};
  if (typeof body.regionStart === "number")    data.regionStart    = body.regionStart;
  if (typeof body.regionEnd === "number")      data.regionEnd      = body.regionEnd;
  if (typeof body.durationSeconds === "number") data.durationSeconds = body.durationSeconds;
  if (typeof body.fileOffset === "number")     data.fileOffset     = body.fileOffset;

  const updated = await prisma.take.update({ where: { id: takeId }, data });
  return NextResponse.json({ take: updated });
}

// DELETE /api/chapters/[chapterId]/takes/[takeId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chapterId: string; takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId, takeId } = await params;

  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });

  if (!take || take.chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (take.chapterId !== chapterId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete from Drive (non-blocking)
  if (take.audioDriveId) {
    deleteDriveFile(session.user.id, take.audioDriveId).catch(() => {});
  }

  // Delete local file if it exists
  if (take.audioFileUrl?.startsWith("/takes/")) {
    const localPath = join(process.cwd(), "public", take.audioFileUrl);
    unlink(localPath).catch(() => {});
  }

  await prisma.take.delete({ where: { id: takeId } });

  return NextResponse.json({ success: true });
}
