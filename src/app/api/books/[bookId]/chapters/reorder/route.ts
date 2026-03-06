import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { orderedIds } = await req.json() as { orderedIds: string[] };

  await Promise.all(
    orderedIds.map((id, idx) =>
      prisma.chapter.update({ where: { id }, data: { order: idx + 1 } })
    )
  );

  return NextResponse.json({ ok: true });
}
