import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { ArrowLeft, BookOpen, Plus } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import ChapterList from "@/components/book/ChapterList";
import BookCover3D from "@/components/book/BookCover3D";
import BookActions from "@/components/book/BookActions";

export default async function BookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });

  if (!book || book.userId !== session!.user.id) notFound();

  // A chapter is "recorded" if it has a direct audio file OR has been processed via takes
  const recordedChapters = book.chapters.filter(
    (c) => c.audioDriveId || c.audioFileUrl || c.processStatus === "done" || c.recordingComplete
  ).length;
  // A chapter is "complete" when explicitly marked so — audio lives on takes, not the chapter record
  const completedChapters = book.chapters.filter((c) => c.recordingComplete).length;
  const totalSeconds = book.chapters.reduce((s, c) => s + (c.durationSeconds ?? 0), 0);

  return (
    <div className="page-enter max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/shelf"
        className="inline-flex items-center gap-1.5 text-sm mb-8 transition-colors"
        style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
        <ArrowLeft className="w-4 h-4" />
        Back to Shelf
      </Link>

      {/* Book header */}
      <div className="ha-card p-8 mb-6">
        <div className="flex items-start gap-8">
          <BookCover3D
            bookId={book.id}
            title={book.title}
            author={book.author}
            coverImageUrl={book.coverImageUrl}
            spineColor={book.spineColor}
          />

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
              <BookActions
                bookId={book.id}
                bookTitle={book.title}
                hasDriveFolder={!!book.driveFolderId}
                book={{
                  title: book.title,
                  subtitle: book.subtitle,
                  author: book.author,
                  narrator: book.narrator,
                  description: book.description,
                  genre: book.genre,
                  language: book.language,
                  publisher: book.publisher,
                  publishYear: book.publishYear,
                  coverImageUrl: book.coverImageUrl,
                }}
                chapters={book.chapters.map(c => ({
                  id: c.id,
                  title: c.title,
                  order: c.order,
                  recordingComplete: c.recordingComplete,
                  processStatus: c.processStatus,
                }))}
              />
            </div>

            <div className="ha-divider" />

            {/* Completion progress bar */}
            {book.chapters.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)", fontSize: "0.6rem", fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: "0.12em" }}>
                    Recording Progress
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
                    {completedChapters}/{book.chapters.length} chapters complete
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${book.chapters.length > 0 ? (completedChapters / book.chapters.length) * 100 : 0}%`,
                      background: completedChapters === book.chapters.length && book.chapters.length > 0
                        ? "var(--green)"
                        : "var(--accent)",
                      boxShadow: completedChapters > 0 ? "0 0 8px rgba(58,123,213,0.4)" : "none",
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-8 text-sm">
              {[
                { label: "Recorded", value: `${recordedChapters}/${book.chapters.length}` },
                { label: "Complete", value: `${completedChapters}/${book.chapters.length}` },
                { label: "Duration", value: totalSeconds > 0 ? formatDuration(totalSeconds) : "—" },
                { label: "Version", value: book.versionTag ?? `v${book.version}` },
                book.genre ? { label: "Genre", value: book.genre } : null,
              ].filter(Boolean).map(({ label, value }: any) => (
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
          <Link href={`/books/${book.id}/chapters/new`} className="ha-btn-primary"
            style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
            <Plus className="w-4 h-4" />
            Add Chapter
          </Link>
        </div>

        {book.chapters.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--text-tertiary)" }} />
            <p className="font-display text-lg mb-2" style={{ color: "var(--text-primary)" }}>No chapters yet</p>
            <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              Add your first chapter to start recording.
            </p>
          </div>
        ) : (
          <ChapterList bookId={book.id} chapters={book.chapters} />
        )}
      </div>
    </div>
  );
}
