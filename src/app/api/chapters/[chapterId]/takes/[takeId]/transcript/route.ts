import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/chapters/[chapterId]/takes/[takeId]/transcript
// Lightweight poll endpoint — returns just the transcript fields.
export async function GET(
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

  if (!take || take.chapter.book.userId !== session.user.id || take.chapterId !== chapterId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    take: {
      id: take.id,
      transcript: take.transcript,
      transcriptStatus: take.transcriptStatus,
    },
  });
}
