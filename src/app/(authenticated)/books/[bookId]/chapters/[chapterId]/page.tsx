import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

export default async function ChapterPage({ params }: { params: Promise<{ bookId: string; chapterId: string }> }) {
  const { bookId, chapterId } = await params;
  const session = await auth();
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, include: { book: true } });
  if (!chapter || chapter.book.userId !== session!.user.id) notFound();

  return (
    <div className="page-enter max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href={`/books/${bookId}`}
        className="inline-flex items-center gap-1.5 text-sm mb-8 transition-colors"
        style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <ArrowLeft className="w-4 h-4" />
        Back to {chapter.book.title}
      </Link>
      <h1 className="text-3xl font-display mb-8" style={{ color: "var(--text-primary)" }}>{chapter.title}</h1>
      <div className="ha-card p-12 text-center">
        <Construction className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--text-tertiary)" }} />
        <h2 className="text-xl font-display mb-3" style={{ color: "var(--text-primary)" }}>
          Recording Studio — Coming in Milestone 2
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          Microphone input, waveform display, and Google Drive sync coming next.
        </p>
      </div>
    </div>
  );
}
