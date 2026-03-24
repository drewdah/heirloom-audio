"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

// Must stay in sync with the Clip interface in ChapterTimeline.tsx
interface Clip {
  id: string;
  label: string;
  audioFileUrl: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  transcript: string | null;
  transcriptStatus: string;
  regionStart: number;
  regionEnd: number;
  recordedAt: string;
}

const CLIP_COLORS = [
  { bg: "rgba(107,21,21,0.15)",  border: "#6B1515" },
  { bg: "rgba(48,209,88,0.12)",   border: "#30d158" },
  { bg: "rgba(255,149,0,0.12)",   border: "#ff9500" },
  { bg: "rgba(191,90,242,0.12)",  border: "#bf5af2" },
  { bg: "rgba(255,55,95,0.12)",   border: "#ff375f" },
  { bg: "rgba(100,210,255,0.12)", border: "#64d2ff" },
];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

interface ClipListProps {
  clips: Clip[];
  onDelete?: (id: string) => void;
  onHoverClip?: (id: string | null) => void;
}

export default function ClipList({ clips, onDelete, onHoverClip }: ClipListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (clips.length === 0) return null;

  return (
    <div
      className="flex flex-col"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "#0a0a0c",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", letterSpacing: "0.1em" }}
        >
          Takes
        </span>
        <span
          className="text-xs rounded-full px-1.5 py-0.5 tabular-nums"
          style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace)" }}
        >
          {clips.length}
        </span>
      </div>

      {/* Clip rows */}
      <div className="flex flex-col divide-y" style={{ divideColor: "rgba(255,255,255,0.03)" } as React.CSSProperties}>
        {clips.map((clip, idx) => {
          const color = CLIP_COLORS[idx % CLIP_COLORS.length];
          const visibleDur = clip.regionEnd - clip.regionStart;
          const status = clip.transcriptStatus;

          return (
            <div
              key={clip.id}
              className="px-4 py-3 flex flex-col gap-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
              onMouseEnter={() => onHoverClip?.(clip.id)}
              onMouseLeave={() => onHoverClip?.(null)}
            >
              {/* Top row: color swatch + label + meta + delete */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Color swatch */}
                <div
                  className="flex-shrink-0 rounded"
                  style={{
                    width: 10, height: 10,
                    background: color.border,
                    boxShadow: `0 0 6px ${color.border}88`,
                  }}
                />

                {/* Label */}
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}
                >
                  {clip.label}
                </span>

                <div className="flex items-center gap-4 ml-auto flex-wrap">
                  {/* Duration */}
                  <MetaChip label="Duration" value={formatDuration(Math.round(visibleDur))} />

                  {/* File size */}
                  <MetaChip label="Size" value={formatBytes(clip.fileSizeBytes)} />

                  {/* Recorded at */}
                  <MetaChip label="Recorded" value={formatDateTime(clip.recordedAt)} />

                  {/* Delete */}
                  {onDelete && (
                    confirmDeleteId === clip.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { onDelete(clip.id); setConfirmDeleteId(null); }}
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.4)", color: "#ef4444", fontFamily: "var(--font-sans)" }}>
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(clip.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--text-tertiary)" }}
                        title="Delete take">
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Transcript row */}
              <TranscriptBox status={status} text={clip.transcript} color={color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        style={{
          fontSize: "0.6rem",
          fontFamily: "var(--font-sans)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--text-secondary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function TranscriptBox({
  status,
  text,
  color,
}: {
  status: string;
  text: string | null;
  color: { bg: string; border: string };
}) {
  if (status === "pending") {
    return (
      <div
        className="rounded px-3 py-2 text-xs"
        style={{
          background: "rgba(255,255,255,0.03)",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-sans)",
          fontStyle: "italic",
        }}
      >
        Transcription queued…
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div
        className="rounded px-3 py-2 flex items-center gap-2 text-xs"
        style={{
          background: "rgba(107,21,21,0.07)",
          border: "1px solid rgba(107,21,21,0.2)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Animated dots */}
        <span className="flex gap-0.5">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="inline-block w-1 h-1 rounded-full"
              style={{
                background: "#6B1515",
                animation: "pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </span>
        Transcribing…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="rounded px-3 py-2 text-xs"
        style={{
          background: "rgba(220,38,38,0.07)",
          border: "1px solid rgba(220,38,38,0.2)",
          color: "rgba(220,38,38,0.8)",
          fontFamily: "var(--font-sans)",
        }}
      >
        Transcription failed. Is faster-whisper installed? (pip install faster-whisper)
      </div>
    );
  }

  // done
  return (
    <textarea
      readOnly
      value={text ?? ""}
      rows={Math.max(2, Math.ceil((text?.length ?? 0) / 100))}
      className="w-full rounded px-3 py-2 text-sm resize-none"
      style={{
        background: color.bg,
        border: `1px solid ${color.border}33`,
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
        lineHeight: 1.6,
        outline: "none",
      }}
    />
  );
}
