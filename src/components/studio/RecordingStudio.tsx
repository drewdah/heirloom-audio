"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle } from "lucide-react";
import ChapterTimeline from "@/components/studio/ChapterTimeline";
import type { Book, Chapter, Take } from "@prisma/client";
import { formatDuration } from "@/lib/utils";

type ChapterWithBook = Chapter & {
  book: Book & { chapters: Chapter[] };
  takes: Take[];
};

interface RecordingStudioProps {
  chapter: ChapterWithBook;
}

export default function RecordingStudio({ chapter: initialChapter }: RecordingStudioProps) {
  const router = useRouter();
  const [chapter, setChapter] = useState(initialChapter);
  const [isPending, startTransition] = useTransition();
  const [completingToggle, setCompletingToggle] = useState(false);

  const book = chapter.book;
  const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
  const currentIdx = sortedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : null;
  const hasAudio = chapter.takes.length > 0 || !!(chapter.audioDriveId || chapter.audioFileUrl);

  const toggleComplete = async () => {
    setCompletingToggle(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: !chapter.recordingComplete }),
      });
      if (res.ok) {
        const { chapter: updated } = await res.json();
        setChapter((c) => ({ ...c, recordingComplete: updated.recordingComplete }));
        startTransition(() => router.refresh());
      }
    } finally {
      setCompletingToggle(false);
    }
  };

  // Build initial clips from takes (sorted by regionStart)
  const initialClips = chapter.takes
    .filter((t) => t.regionStart !== null)
    .map((t) => ({
      id: t.id,
      label: t.label,
      audioFileUrl: t.audioFileUrl,
      audioDriveId: t.audioDriveId,
      durationSeconds: t.durationSeconds,
      regionStart: t.regionStart ?? 0,
      regionEnd: t.regionEnd ?? (t.regionStart ?? 0) + (t.durationSeconds ?? 0),
      fileOffset: (t as any).fileOffset ?? 0,
      recordedAt: t.recordedAt.toString(),
      isActive: t.isActive,
    }))
    .sort((a, b) => a.regionStart - b.regionStart);

  return (
    <div className="page-enter flex flex-col min-h-screen" style={{ background: "#080809" }}>

      {/* ── Top nav ── */}
      <div className="border-b sticky top-14 z-30 flex-shrink-0"
        style={{ background: "rgba(8,8,9,0.96)", borderColor: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-4">
          <Link href={`/books/${book.id}`}
            className="flex items-center gap-1.5 text-sm transition-colors flex-shrink-0"
            style={{ color: "var(--text-tertiary)" }}>
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline truncate max-w-[140px]">{book.title}</span>
          </Link>

          <div className="flex-1" />

          {/* Chapter nav */}
          <div className="flex items-center gap-1">
            <Link href={prevChapter ? `/books/${book.id}/chapters/${prevChapter.id}` : "#"}
              className="p-1.5 rounded transition-colors"
              style={{ color: prevChapter ? "var(--text-secondary)" : "var(--text-tertiary)", opacity: prevChapter ? 1 : 0.3, pointerEvents: prevChapter ? "auto" : "none" }}>
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <span className="text-xs tabular-nums px-1"
              style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", minWidth: "52px", textAlign: "center" }}>
              {currentIdx + 1} of {sortedChapters.length}
            </span>
            <Link href={nextChapter ? `/books/${book.id}/chapters/${nextChapter.id}` : "#"}
              className="p-1.5 rounded transition-colors"
              style={{ color: nextChapter ? "var(--text-secondary)" : "var(--text-tertiary)", opacity: nextChapter ? 1 : 0.3, pointerEvents: nextChapter ? "auto" : "none" }}>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex-1" />

          {/* Status badges */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full"
                style={{
                  background: hasAudio ? "var(--green)" : "rgba(255,255,255,0.15)",
                  boxShadow: hasAudio ? "0 0 6px rgba(48,209,88,0.5)" : "none",
                }} />
              <span className="text-xs hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                {hasAudio ? "Recorded" : "Not recorded"}
              </span>
            </div>
            {chapter.recordingComplete && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
                <span className="text-xs hidden sm:inline" style={{ color: "var(--green)" }}>Complete</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 pb-24 flex flex-col gap-6 flex-1">

        {/* ── Chapter title + completion toggle ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.15em", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
              {chapter.groupTitle ? (
                <><span style={{ color: "var(--accent)" }}>{chapter.groupTitle}</span>{" · "}Chapter {chapter.order}</>
              ) : (
                <>Chapter {chapter.order}</>
              )}
            </p>
            <div className="flex items-baseline gap-4">
              <h1 className="text-3xl font-display" style={{ color: "var(--text-primary)" }}>
                {chapter.title}
              </h1>
              {chapter.durationSeconds && (
                <span className="text-sm flex-shrink-0"
                  style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  {formatDuration(chapter.durationSeconds)}
                </span>
              )}
            </div>
          </div>

          {hasAudio && (
            <button
              onClick={toggleComplete}
              disabled={completingToggle}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 disabled:opacity-50"
              style={{
                background: chapter.recordingComplete ? "rgba(48,209,88,0.15)" : "var(--bg-raised)",
                border: `1px solid ${chapter.recordingComplete ? "rgba(48,209,88,0.4)" : "var(--border-default)"}`,
                color: chapter.recordingComplete ? "var(--green)" : "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}>
              {chapter.recordingComplete
                ? <CheckCircle2 className="w-4 h-4" />
                : <Circle className="w-4 h-4" />}
              {chapter.recordingComplete ? "Marked Complete" : "Mark as Complete"}
            </button>
          )}
        </div>

        {/* ── Timeline ── */}
        <ChapterTimeline
          chapterId={chapter.id}
          initialClips={initialClips}
        />

      </div>
    </div>
  );
}
