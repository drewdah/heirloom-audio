"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createChapter, createBatchChapters } from "@/app/(authenticated)/books/[bookId]/chapters/new/actions";

interface NewChapterFormProps {
  bookId: string;
  nextOrder: number;
  lastGroupTitle: string;
}

export default function NewChapterForm({ bookId, nextOrder, lastGroupTitle }: NewChapterFormProps) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [groupTitle, setGroupTitle] = useState(lastGroupTitle);
  const [count, setCount] = useState(10);
  const [startFrom, setStartFrom] = useState(1);

  const batchPreview = count > 0
    ? [
        `${groupTitle ? groupTitle + " - " : ""}Chapter ${startFrom}`,
        `${groupTitle ? groupTitle + " - " : ""}Chapter ${startFrom + 1}`,
        count > 2 ? "…" : null,
        count > 1 ? `${groupTitle ? groupTitle + " - " : ""}Chapter ${startFrom + count - 1}` : null,
      ].filter(Boolean)
    : [];

  return (
    <div className="ha-card p-8">
      {/* Mode toggle */}
      <div
        className="flex mb-8 p-1 rounded-lg"
        style={{ background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)" }}>
        {(["single", "batch"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              fontFamily: "var(--font-sans)",
              background: mode === m ? "var(--bg-raised)" : "transparent",
              color: mode === m ? "var(--text-primary)" : "var(--text-tertiary)",
              border: mode === m ? "1px solid var(--border-default)" : "1px solid transparent",
            }}>
            {m === "single" ? "Single Chapter" : "Batch Create"}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <form action={(fd) => createChapter(bookId, fd)} className="flex flex-col gap-6">
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
              Book / Section
              <span className="ml-2 font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span>
            </label>
            <input
              name="groupTitle"
              className="ha-input"
              placeholder="e.g. Genesis, Matthew, Psalms"
              defaultValue={lastGroupTitle}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
              Chapter Title *
            </label>
            <input name="title" required className="ha-input" placeholder="e.g. Chapter 1" autoFocus />
          </div>
          <div className="px-4 py-3 rounded-lg text-xs"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
            <span style={{ opacity: 0.6 }}>M4B chapter marker: </span>
            <span style={{ color: "var(--text-secondary)" }}>
              {lastGroupTitle ? `${lastGroupTitle}: Chapter 1` : "Chapter 1"}
            </span>
          </div>
          <div className="flex gap-3 justify-end">
            <Link href={`/books/${bookId}`} className="ha-btn-ghost">Cancel</Link>
            <button type="submit" className="ha-btn-primary">Create Chapter</button>
          </div>
        </form>
      ) : (
        <form action={(fd) => createBatchChapters(bookId, fd)} className="flex flex-col gap-6">
          <div>
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
              Section Name
              <span className="ml-2 font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span>
            </label>
            <input
              name="groupTitle"
              className="ha-input"
              placeholder="e.g. Genesis, Part One"
              value={groupTitle}
              onChange={e => setGroupTitle(e.target.value)}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
                Number of Chapters *
              </label>
              <input
                name="count"
                type="number"
                min={1}
                max={500}
                required
                className="ha-input"
                value={count}
                onChange={e => setCount(parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", letterSpacing: "0.02em" }}>
                Start Numbering At
              </label>
              <input
                name="startFrom"
                type="number"
                min={1}
                required
                className="ha-input"
                value={startFrom}
                onChange={e => setStartFrom(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Preview */}
          {batchPreview.length > 0 && (
            <div className="px-4 py-3 rounded-lg"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)", fontFamily: "var(--font-sans)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
                Will create {count} chapter{count !== 1 ? "s" : ""} starting at order {nextOrder}:
              </p>
              <div className="flex flex-col gap-1">
                {batchPreview.map((line, i) => (
                  <span key={i} className="text-xs" style={{ color: line === "…" ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
                    {line}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Link href={`/books/${bookId}`} className="ha-btn-ghost">Cancel</Link>
            <button type="submit" className="ha-btn-primary">
              Create {count > 0 ? count : ""} Chapter{count !== 1 ? "s" : ""}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
