import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/chapters/[chapterId]/complete — toggle recordingComplete
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // Accept explicit value or toggle
  const newValue = typeof body.complete === "boolean" ? body.complete : !chapter.recordingComplete;

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: { recordingComplete: newValue },
  });

  return NextResponse.json({ chapter: updated });
}
