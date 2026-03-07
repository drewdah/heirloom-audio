"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2, Upload, ChevronLeft, ChevronRight, Mic, CheckCircle2, Circle } from "lucide-react";
import AudioRecorder from "@/components/studio/AudioRecorder";
import FileUploader from "@/components/studio/FileUploader";
import WaveformPlayer from "@/components/studio/WaveformPlayer";
import PunchInRecorder from "@/components/studio/PunchInRecorder";
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
  const [takes, setTakes] = useState<Take[]>(initialChapter.takes ?? []);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [panel, setPanel] = useState<"record" | "upload">("record");
  const [completingToggle, setCompletingToggle] = useState(false);

  const book = chapter.book;
  const sortedChapters = [...book.chapters].sort((a, b) => a.order - b.order);
  const currentIdx = sortedChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < sortedChapters.length - 1 ? sortedChapters[currentIdx + 1] : null;
  const hasAudio = !!(chapter.audioDriveId || chapter.audioFileUrl);

  const sendAudio = async (formData: FormData) => {
    const res = await fetch(`/api/chapters/${chapter.id}/audio`, { method: "POST", body: formData });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Upload failed");
    }
    const { chapter: updated } = await res.json();
    setChapter((c) => ({ ...c, ...updated }));
    startTransition(() => router.refresh());
  };

  const uploadAudio = async (blob: Blob, duration: number) => {
    const fd = new FormData();
    const baseType = blob.type.split(";")[0].trim();
    const ext = baseType.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", new File([blob], `recording.${ext}`, { type: baseType }));
    fd.append("duration", String(duration));
    await sendAudio(fd);
  };

  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("audio", file);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    const duration = await new Promise<number>((resolve) => {
      audio.onloadedmetadata = () => { resolve(audio.duration); URL.revokeObjectURL(url); };
      audio.onerror = () => { resolve(0); URL.revokeObjectURL(url); };
    });
    fd.append("duration", String(duration));
    await sendAudio(fd);
  };

  const deleteAudio = async () => {
    const res = await fetch(`/api/chapters/${chapter.id}/audio`, { method: "DELETE" });
    if (res.ok) {
      const { chapter: updated } = await res.json();
      setChapter((c) => ({ ...c, ...updated }));
      setDeleteConfirm(false);
      startTransition(() => router.refresh());
    }
  };

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
            <span className="text-xs tabular-nums px-1" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", minWidth: "52px", textAlign: "center" }}>
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
            {/* Recorded indicator */}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full"
                style={{ background: hasAudio ? "var(--green)" : "rgba(255,255,255,0.15)", boxShadow: hasAudio ? "0 0 6px rgba(48,209,88,0.5)" : "none" }} />
              <span className="text-xs hidden sm:inline" style={{ color: "var(--text-tertiary)" }}>
                {hasAudio ? "Recorded" : "Not recorded"}
              </span>
            </div>
            {/* Complete indicator */}
            {chapter.recordingComplete && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
                <span className="text-xs hidden sm:inline" style={{ color: "var(--green)" }}>Complete</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-6 flex-1">

        {/* ── Chapter title + completion toggle ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-1"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.15em", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
              Chapter {chapter.order}
            </p>
            <div className="flex items-baseline gap-4">
              <h1 className="text-3xl font-display" style={{ color: "var(--text-primary)" }}>
                {chapter.title}
              </h1>
              {chapter.durationSeconds && (
                <span className="text-sm flex-shrink-0" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  {formatDuration(chapter.durationSeconds)}
                </span>
              )}
            </div>
          </div>

          {/* Mark complete button — only shown when audio exists */}
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

        {/* ── Waveform / empty state ── */}
        <div className="flex-1">
          {hasAudio && chapter.audioFileUrl ? (
            <div className="flex flex-col gap-4">
              <WaveformPlayer
                audioUrl={`/api/chapters/${chapter.id}/stream`}
                fileName={chapter.audioFileName ?? undefined}
                fileSizeBytes={chapter.audioFileSizeBytes ?? undefined}
                duration={chapter.durationSeconds}
              />

              {/* Punch-in recorder */}
              {chapter.durationSeconds && chapter.durationSeconds > 0 && (
                <PunchInRecorder
                  chapterId={chapter.id}
                  totalDuration={chapter.durationSeconds}
                  existingTakes={takes}
                  onTakeAdded={(take) => setTakes((prev) => [...prev, take])}
                />
              )}

              {/* Delete link below */}
              <div className="flex items-center justify-end gap-4">
                {chapter.recordedAt && (
                  <span className="text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                    Recorded {new Date(chapter.recordedAt).toLocaleDateString()}
                  </span>
                )}
                {!deleteConfirm ? (
                  <button onClick={() => setDeleteConfirm(true)}
                    className="flex items-center gap-1.5 text-xs transition-colors"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete recording
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Delete and remove from Drive?</span>
                    <button onClick={deleteAudio}
                      className="px-3 py-1 rounded text-xs font-medium"
                      style={{ background: "var(--red)", color: "white" }}>
                      Delete
                    </button>
                    <button onClick={() => setDeleteConfirm(false)}
                      className="px-3 py-1 rounded text-xs"
                      style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-default)" }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl py-16 gap-3"
              style={{ background: "#0d0d10", border: "1px dashed rgba(255,255,255,0.08)" }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)" }}>
                <Mic className="w-7 h-7" style={{ color: "var(--text-tertiary)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                No audio recorded yet
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
                Use the controls below to record or upload a file
              </p>
            </div>
          )}
        </div>

        {/* ── Record / Upload panel ── */}
        <div className="rounded-xl overflow-hidden flex-shrink-0"
          style={{ background: "#0d0d10", border: "1px solid var(--border-subtle)" }}>

          <div className="flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {(["record", "upload"] as const).map((tab) => (
              <button key={tab} onClick={() => setPanel(tab)}
                className="flex-1 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                style={{
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-sans)",
                  color: panel === tab ? "var(--text-primary)" : "var(--text-tertiary)",
                  borderBottom: `2px solid ${panel === tab ? "var(--accent)" : "transparent"}`,
                  background: panel === tab ? "var(--bg-raised)" : "transparent",
                }}>
                {tab === "record" ? <Mic className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                {tab}
              </button>
            ))}
          </div>

          <div className="p-6">
            {panel === "record" ? (
              <AudioRecorder onRecordingComplete={uploadAudio} disabled={hasAudio} />
            ) : (
              <FileUploader onUpload={uploadFile} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
