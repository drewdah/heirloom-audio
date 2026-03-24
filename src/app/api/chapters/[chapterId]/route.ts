import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { book: true } });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      title: body.title ?? chapter.title,
      // Allow explicit null to clear the group, or a new string to set it
      ...("groupTitle" in body ? { groupTitle: body.groupTitle || null } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true, takes: true },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Collect all Drive file IDs belonging to this chapter
  const driveFileIds = [
    chapter.audioDriveId,
    ...chapter.takes.map((t) => t.audioDriveId),
  ].filter(Boolean) as string[];

  // Delete from DB first — Drive cleanup is fire-and-forget, non-fatal
  await prisma.chapter.delete({ where: { id: chapterId } });

  if (driveFileIds.length > 0) {
    import("@/lib/google-drive").then(({ deleteDriveFile }) =>
      Promise.all(
        driveFileIds.map((fileId) =>
          deleteDriveFile(session.user!.id, fileId).catch((err) =>
            console.warn(`[chapter delete] Drive file ${fileId} deletion failed (non-fatal):`, err)
          )
        )
      )
    );
  }

  return NextResponse.json({ ok: true });
}
