"use client";
import { BookOpen, Mic, CheckCircle, ChevronRight } from "lucide-react";

interface BookStatusBarProps {
  bookTitle: string;
  totalChapters: number;
  recordedChapters: number;
  completedChapters: number;
  currentChapter?: { order: number; title: string };
}

export default function BookStatusBar({ bookTitle, totalChapters, recordedChapters, completedChapters, currentChapter }: BookStatusBarProps) {
  const remaining = totalChapters - completedChapters;
  const pct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t"
      style={{
        background: "rgba(10,10,10,0.92)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6" style={{ height: "48px" }}>

          <div className="flex items-center gap-6" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", fontSize: "0.875rem" }}>
            <span className="flex items-center gap-2">
              <BookOpen style={{ width: "16px", height: "16px", color: "var(--accent)", flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{bookTitle}</span>
              {currentChapter && (
                <>
                  <ChevronRight style={{ width: "12px", height: "12px", color: "var(--text-tertiary)", flexShrink: 0 }} />
                  <span style={{ color: "var(--text-tertiary)" }}>Ch. {currentChapter.order}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{currentChapter.title}</span>
                </>
              )}
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <Mic style={{ width: "16px", height: "16px", color: "var(--accent)", flexShrink: 0 }} />
              <span>
                <span style={{ color: "var(--text-secondary)" }}>{recordedChapters}</span>
                {" / "}
                <span style={{ color: "var(--text-secondary)" }}>{totalChapters}</span>
                {" recorded"}
              </span>
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <CheckCircle style={{ width: "16px", height: "16px", color: "var(--accent)", flexShrink: 0 }} />
              <span>
                <span style={{ color: "var(--text-secondary)" }}>{completedChapters}</span>
                {" complete"}
                {remaining > 0 && (
                  <>, <span style={{ color: "var(--text-secondary)" }}>{remaining}</span>{" left"}</>
                )}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            {totalChapters > 0 && (
              <div className="hidden sm:flex items-center gap-3">
                <div style={{ height: "6px", width: "120px", borderRadius: "3px", overflow: "hidden", background: "var(--bg-raised)" }}>
                  <div style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: pct === 100 ? "var(--green)" : "var(--accent)",
                    borderRadius: "3px",
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", minWidth: "36px" }}>{pct}%</span>
              </div>
            )}
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", opacity: 0.4, fontFamily: "var(--font-sans)" }}>v0.1</span>
          </div>

        </div>
      </div>
    </div>
  );
}
