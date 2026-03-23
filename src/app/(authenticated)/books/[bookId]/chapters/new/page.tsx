import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewChapterForm from "@/components/book/NewChapterForm";

export default async function NewChapterPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();
  const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: { orderBy: { order: "desc" } } } });
  if (!book || book.userId !== session!.user.id) notFound();

  const lastGroupTitle = book.chapters.find((c) => c.groupTitle)?.groupTitle ?? "";
  const nextOrder = book.chapters.length + 1;

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
        Chapter {nextOrder}
      </p>
      <NewChapterForm bookId={bookId} nextOrder={nextOrder} lastGroupTitle={lastGroupTitle} />
    </div>
  );
}
