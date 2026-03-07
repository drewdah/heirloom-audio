import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function NewChapterPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();
  const book = await prisma.book.findUnique({ where: { id: bookId }, include: { chapters: { orderBy: { order: "desc" } } } });
  if (!book || book.userId !== session!.user.id) notFound();

  // Auto-suggest the most recently used group title
  const lastGroupTitle = book.chapters.find((c) => c.groupTitle)?.groupTitle ?? "";
  const nextOrder = book.chapters.length + 1;

  async function createChapter(formData: FormData) {
    "use server";
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
      <div className="ha-card p-8">
        <form action={createChapter} className="flex flex-col gap-6">

          {/* Group title — the "Book of the Bible" level */}
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
              Book / Section
              <span className="ml-2 font-normal" style={{ color: "var(--text-tertiary)" }}>
                (optional — groups chapters in the M4B player)
              </span>
            </label>
            <input
              name="groupTitle"
              className="ha-input"
              placeholder="e.g. Genesis, Matthew, Psalms"
              defaultValue={lastGroupTitle}
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              In an audiobook player this appears as the section heading — e.g. &ldquo;Genesis&rdquo; containing
              &ldquo;Chapter 1&rdquo;, &ldquo;Chapter 2&rdquo;&hellip;
            </p>
          </div>

          {/* Chapter title */}
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
              Chapter Title *
            </label>
            <input
              name="title"
              required
              className="ha-input"
              placeholder="e.g. Chapter 1"
              autoFocus
            />
          </div>

          {/* Preview */}
          <div className="px-4 py-3 rounded-lg text-xs"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
            <span style={{ opacity: 0.6 }}>M4B chapter marker will read: </span>
            <span style={{ color: "var(--text-secondary)" }} id="preview-text">
              {lastGroupTitle ? `${lastGroupTitle}: Chapter 1` : "Chapter 1"}
            </span>
          </div>

          <div className="flex gap-3 justify-end">
            <Link href={`/books/${bookId}`} className="ha-btn-ghost">Cancel</Link>
            <button type="submit" className="ha-btn-primary">Create Chapter</button>
          </div>
        </form>
      </div>
    </div>
  );
}
