import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bookUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  subtitle: z.string().max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  narrator: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  genre: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  isbn: z.string().max(20).optional(),
  publisher: z.string().max(200).optional(),
  publishYear: z.number().int().min(1800).max(2100).optional(),
  status: z.enum(["IN_PROGRESS", "COMPLETE", "ARCHIVED"]).optional(),
});

async function getAuthorizedBook(bookId: string, userId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== userId) return null;
  return book;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: "asc" } }, exports: { orderBy: { exportedAt: "desc" } } },
  });

  if (!book || book.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(book);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await getAuthorizedBook(bookId, session.user.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = bookUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const updated = await prisma.book.update({
    where: { id: bookId },
    data: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await getAuthorizedBook(bookId, session.user.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.book.delete({ where: { id: bookId } });
  return NextResponse.json({ success: true });
}
