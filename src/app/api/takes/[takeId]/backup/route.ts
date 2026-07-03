import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { backupTake } from "@/lib/take-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/takes/[takeId]/backup — (re)attempt the off-site Drive backup of a
// take's original recording. Idempotent; returns the take with its new status.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { takeId } = await params;
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });
  if (!take || take.chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await backupTake(takeId);

  const updated = await prisma.take.findUnique({ where: { id: takeId } });
  return NextResponse.json({ take: updated });
}
