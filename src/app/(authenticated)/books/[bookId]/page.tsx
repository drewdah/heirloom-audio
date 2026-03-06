import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Edit, Mic, Plus } from "lucide-react";
import { formatDuration } from "@/lib/utils";

export default async function BookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });

  if (!book || book.userId !== session!.user.id) notFound();

  const recordedChapters = book.chapters.filter((c) => c.audioDriveId || c.audioFileUrl).length;
  const totalSeconds = book.chapters.reduce((s, c) => s + (c.durationSeconds ?? 0), 0);

  return (
    <div className="page-enter max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/shelf"
        className="inline-flex items-center gap-1.5 text-sm mb-8 transition-colors"
        style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <ArrowLeft className="w-4 h-4" />
        Back to Shelf
      </Link>

      {/* Book header card */}
      <div className="ha-card p-8 mb-6">
        <div className="flex items-start gap-8">
          {/* Cover */}
          <div className="flex-shrink-0">
            {book.coverImageUrl ? (
              <img src={book.coverImageUrl} alt={book.title}
                className="w-32 h-32 object-cover rounded-lg"
                style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }} />
            ) : (
              <div className="w-32 h-32 rounded-lg flex items-center justify-center"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)" }}>
                <BookOpen className="w-10 h-10" style={{ color: "var(--text-tertiary)" }} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-display mb-1" style={{ color: "var(--text-primary)" }}>
                  {book.title}
                </h1>
                {book.subtitle && (
                  <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>{book.subtitle}</p>
                )}
                <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  by <span style={{ color: "var(--text-secondary)" }}>{book.author}</span>
                  {book.narrator && (
                    <> · narrated by <span style={{ color: "var(--text-secondary)" }}>{book.narrator}</span></>
                  )}
                </p>
              </div>
              <Link href={`/books/${book.id}/edit`}
                className="ha-btn-ghost flex items-center gap-1.5 text-sm flex-shrink-0"
                style={{ padding: "0.4rem 0.875rem" }}>
                <Edit className="w-3.5 h-3.5" />
                Edit
              </Link>
            </div>

            <div className="ha-divider" />

            <div className="flex gap-8 text-sm">
              {[
                { label: "Chapters", value: `${recordedChapters}/${book.chapters.length}` },
                { label: "Recorded", value: totalSeconds > 0 ? formatDuration(totalSeconds) : "—" },
                { label: "Version",  value: book.versionTag ?? `v${book.version}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-tertiary)", letterSpacing: "0.1em", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
                    {label}
                  </p>
                  <p className="font-display text-xl" style={{ color: "var(--text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chapters */}
      <div className="ha-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-display" style={{ color: "var(--text-primary)" }}>Chapters</h2>
          <Link href={`/books/${book.id}/chapters/new`} className="ha-btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
            <Plus className="w-4 h-4" />
            Add Chapter
          </Link>
        </div>

        {book.chapters.length === 0 ? (
          <div className="text-center py-12">
            <Mic className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--text-tertiary)" }} />
            <p className="font-display text-lg mb-2" style={{ color: "var(--text-primary)" }}>No chapters yet</p>
            <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              Add your first chapter to start recording.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {book.chapters.map((chapter, i) => (
              <Link key={chapter.id} href={`/books/${book.id}/chapters/${chapter.id}`}
                className="chapter-row flex items-center gap-4 px-4 py-3 rounded-lg transition-all">
                <span className="text-xs font-mono w-7 text-right flex-shrink-0"
                  style={{ color: "var(--text-tertiary)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                    {chapter.title}
                  </p>
                </div>
                {chapter.durationSeconds ? (
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                    {formatDuration(chapter.durationSeconds)}
                  </span>
                ) : null}
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    background: (chapter.audioDriveId || chapter.audioFileUrl) ? "var(--green)" : "var(--bg-overlay)",
                    boxShadow: (chapter.audioDriveId || chapter.audioFileUrl) ? "0 0 6px rgba(48,209,88,0.5)" : "none",
                  }} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
