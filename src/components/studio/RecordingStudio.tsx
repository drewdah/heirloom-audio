"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle, Loader2, Lock } from "lucide-react";
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
  const [processStatus, setProcessStatus] = useState<"idle" | "processing" | "done" | "error">(
    (initialChapter as any).processStatus ?? "idle"
  );
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const book = chapter.book;
  const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
  const currentIdx = sortedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : null;
  const hasAudio = chapter.takes.length > 0 || !!(chapter.audioDriveId || chapter.audioFileUrl);

  // If we load with processStatus=processing (e.g. page refresh mid-process), resume polling
  useEffect(() => {
    if (processStatus === "processing") startPolling();
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/chapters/${chapter.id}/process`);
        if (!res.ok) return;
        const { chapter: updated } = await res.json();
        if (updated.processStatus === "done" || updated.processStatus === "error") {
          setProcessStatus(updated.processStatus);
          clearInterval(timer);
          pollTimerRef.current = null;
          startTransition(() => router.refresh());
        }
      } catch { /* ignore */ }
    }, 3000);
    pollTimerRef.current = timer;
  }

  const toggleComplete = async () => {
    setCompletingToggle(true);
    try {
      const newComplete = !chapter.recordingComplete;
      const res = await fetch(`/api/chapters/${chapter.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: newComplete }),
      });
      if (res.ok) {
        const { chapter: updated } = await res.json();
        setChapter((c) => ({ ...c, recordingComplete: updated.recordingComplete }));

        if (newComplete) {
          // Just marked complete — start processing
          setProcessStatus("processing");
          startPolling();
        } else {
          // Unmarked — reset
          setProcessStatus("idle");
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
        startTransition(() => router.refresh());
      }
    } finally {
      setCompletingToggle(false);
    }
  };

  const isLocked = chapter.recordingComplete;
  const isProcessing = processStatus === "processing";

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
      fileSizeBytes: t.fileSizeBytes ?? null,
      transcript: (t as any).transcript ?? null,
      transcriptStatus: (t as any).transcriptStatus ?? "pending",
      processedFileUrl: (t as any).processedFileUrl ?? null,
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
                {isProcessing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--accent)" }} />
                  : <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />}
                <span className="text-xs hidden sm:inline"
                  style={{ color: isProcessing ? "var(--accent)" : "var(--green)" }}>
                  {isProcessing ? "Processing…" : "Complete"}
                </span>
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
              disabled={completingToggle || isProcessing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 disabled:opacity-50"
              title={isLocked ? "Unmark to re-enable recording" : "Mark complete and process audio"}
              style={{
                background: isLocked ? "rgba(48,209,88,0.15)" : "var(--bg-raised)",
                border: `1px solid ${isLocked ? "rgba(48,209,88,0.4)" : "var(--border-default)"}`,
                color: isLocked ? "var(--green)" : "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}>
              {completingToggle || isProcessing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isLocked
                ? <CheckCircle2 className="w-4 h-4" />
                : <Circle className="w-4 h-4" />}
              {isProcessing ? "Processing…"
                : isLocked ? "Complete"
                : "Mark as Complete"}
            </button>
          )}
        </div>

        {/* ── Locked banner ── */}
        {isLocked && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg"
            style={{
              background: "rgba(48,209,88,0.05)",
              border: "1px solid rgba(48,209,88,0.15)",
            }}>
            <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(48,209,88,0.6)" }} />
            <p className="text-sm flex-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              {isProcessing
                ? "Audio is being processed — EQ, compression, noise reduction and de-essing are being applied."
                : processStatus === "done"
                ? "Audio has been processed. Click \"Complete\" to re-open this chapter for editing."
                : "This chapter is marked complete. Click \"Complete\" to re-open it for editing."}
            </p>
          </div>
        )}

        {/* ── Timeline (locked when complete) ── */}
        <ChapterTimeline
          chapterId={chapter.id}
          initialClips={initialClips}
          locked={isLocked}
        />

      </div>
    </div>
  );
}
