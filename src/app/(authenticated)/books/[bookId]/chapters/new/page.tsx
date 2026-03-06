import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewChapterPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();
  const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: true } });
  if (!book || book.userId !== session!.user.id) notFound();

  async function createChapter(formData: FormData) {
    "use server";
    const session = await auth();
    const title = formData.get("title") as string;
    if (!title?.trim()) return;
    const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: true } });
    if (!book || book.userId !== session!.user.id) return;
    const chapter = await prisma.chapter.create({ data: { bookId, title: title.trim(), order: book.chapters.length + 1 } });
    redirect(`/books/${bookId}/chapters/${chapter.id}`);
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href={`/books/${bookId}`}
        className="inline-flex items-center gap-1.5 text-sm mb-8"
        style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <ArrowLeft className="w-4 h-4" />
        Back to {book.title}
      </Link>
      <h1 className="text-3xl font-display mb-1" style={{ color: "var(--text-primary)" }}>New Chapter</h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
        Chapter {book.chapters.length + 1}
      </p>
      <div className="ha-card p-8">
        <form action={createChapter}>
          <label className="block text-xs font-medium mb-2"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
            Chapter Title *
          </label>
          <input name="title" required className="ha-input mb-6"
            placeholder="e.g. Genesis, Chapter 1" autoFocus />
          <div className="flex gap-3 justify-end">
            <Link href={`/books/${bookId}`} className="ha-btn-ghost">Cancel</Link>
            <button type="submit" className="ha-btn-primary">Create Chapter</button>
          </div>
        </form>
      </div>
    </div>
  );
}
