"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GripVertical, Mic, Trash2, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import type { Chapter } from "@prisma/client";

interface ChapterListProps {
  bookId: string;
  chapters: Chapter[];
}

export default function ChapterList({ bookId, chapters: initial }: ChapterListProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const reorder = async (newChapters: Chapter[]) => {
    setChapters(newChapters);
    await fetch(`/api/books/${bookId}/chapters/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newChapters.map((c) => c.id) }),
    });
    startTransition(() => router.refresh());
  };

  const handleDragStart = (id: string) => setDragging(id);
  const handleDragEnd = () => { setDragging(null); setDragOver(null); };

  const handleDrop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = chapters.findIndex((c) => c.id === dragging);
    const to = chapters.findIndex((c) => c.id === targetId);
    const next = [...chapters];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    const reindexed = next.map((c, i) => ({ ...c, order: i + 1 }));
    reorder(reindexed);
    setDragging(null);
    setDragOver(null);
  };

  const deleteChapter = async (id: string) => {
    const res = await fetch(`/api/chapters/${id}`, { method: "DELETE" });
    if (res.ok) {
      const next = chapters.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i + 1 }));
      setChapters(next);
      setDeleteId(null);
      startTransition(() => router.refresh());
    }
  };

  // Group chapters by groupTitle for visual separation
  // We track when the groupTitle changes to insert a header row
  let lastGroupTitle: string | null | undefined = undefined;

  return (
    <div className="space-y-1">
      {chapters.map((chapter) => {
        const hasAudio = !!(chapter.audioDriveId || chapter.audioFileUrl || chapter.processStatus === "done" || chapter.recordingComplete);
        const isDragging = dragging === chapter.id;
        const isOver = dragOver === chapter.id;

        // Insert a group header when groupTitle changes
        const showGroupHeader = chapter.groupTitle !== lastGroupTitle;
        lastGroupTitle = chapter.groupTitle;

        return (
          <div key={chapter.id}>
            {/* Group header */}
            {showGroupHeader && chapter.groupTitle && (
              <div className="flex items-center gap-3 px-3 pt-4 pb-1 first:pt-0">
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "var(--accent)", fontFamily: "var(--font-sans)", letterSpacing: "0.12em" }}>
                  {chapter.groupTitle}
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(58,123,213,0.2)" }} />
              </div>
            )}

            <div
              draggable
              onDragStart={() => handleDragStart(chapter.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => { e.preventDefault(); setDragOver(chapter.id); }}
              onDrop={() => handleDrop(chapter.id)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg transition-all group"
              style={{
                background: isOver ? "var(--bg-raised)" : isDragging ? "var(--bg-elevated)" : "transparent",
                border: `1px solid ${isOver ? "var(--accent)" : "transparent"}`,
                opacity: isDragging ? 0.4 : 1,
                cursor: "grab",
                paddingLeft: chapter.groupTitle ? "1.5rem" : undefined, // indent grouped chapters
              }}>

              {/* Drag handle */}
              <GripVertical className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }} />

              {/* Order number */}
              <span className="text-xs font-mono w-6 text-right flex-shrink-0"
                style={{ color: "var(--text-tertiary)" }}>
                {String(chapter.order).padStart(2, "0")}
              </span>

              {/* Title link */}
              <Link
                href={`/books/${bookId}/chapters/${chapter.id}`}
                className="flex-1 min-w-0 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
                draggable={false}>
                <span className="text-sm font-medium truncate hover:underline"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  {chapter.title}
                </span>
              </Link>

              {/* Duration */}
              {chapter.durationSeconds ? (
                <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  {formatDuration(chapter.durationSeconds)}
                </span>
              ) : null}

              {/* Status */}
              {chapter.recordingComplete
                ? <span title="Complete"><CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--green)" }} /></span>
                : hasAudio
                ? <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--green)", boxShadow: "0 0 5px rgba(48,209,88,0.5)" }} title="Recorded" />
                : <Mic className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100"
                    style={{ color: "var(--text-tertiary)" }} />}

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteId(chapter.id); }}
                className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-tertiary)" }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Inline delete confirm */}
            {deleteId === chapter.id && (
              <div className="mx-3 mb-2 px-4 py-3 rounded-lg flex items-center justify-between gap-4"
                style={{ background: "rgba(255,69,58,0.08)", border: "1px solid rgba(255,69,58,0.25)" }}>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Delete &ldquo;{chapter.title}&rdquo;?
                </p>
                <div className="flex gap-2">
                  <button onClick={() => deleteChapter(chapter.id)}
                    className="px-3 py-1 rounded text-xs font-medium"
                    style={{ background: "var(--red)", color: "white" }}>
                    Delete
                  </button>
                  <button onClick={() => setDeleteId(null)}
                    className="px-3 py-1 rounded text-xs ha-btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
