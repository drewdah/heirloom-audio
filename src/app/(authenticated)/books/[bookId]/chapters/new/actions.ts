"use server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createChapter(bookId: string, formData: FormData) {
  const session = await auth();
  const title = formData.get("title") as string;
  const groupTitle = (formData.get("groupTitle") as string)?.trim() || null;
  if (!title?.trim()) return;
  const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: true } });
  if (!book || book.userId !== session!.user.id) return;
  const chapter = await prisma.chapter.create({
    data: {
      bookId,
      title: title.trim(),
      groupTitle,
      order: book.chapters.length + 1,
    },
  });
  redirect(`/books/${bookId}/chapters/${chapter.id}`);
}

export async function createBatchChapters(bookId: string, formData: FormData) {
  const session = await auth();
  const groupTitle = (formData.get("groupTitle") as string)?.trim() || null;
  const count = parseInt(formData.get("count") as string, 10);
  const startFrom = parseInt(formData.get("startFrom") as string, 10) || 1;

  if (!count || count < 1 || count > 500) return;

  const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: true } });
  if (!book || book.userId !== session!.user.id) return;

  const baseOrder = book.chapters.length + 1;
  await prisma.chapter.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      bookId,
      title: `Chapter ${startFrom + i}`,
      groupTitle,
      order: baseOrder + i,
    })),
  });

  redirect(`/books/${bookId}`);
}
