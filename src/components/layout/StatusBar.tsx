import { prisma } from "@/lib/prisma";
import { formatDuration } from "@/lib/utils";
import { BookOpen, Clock, Mic } from "lucide-react";

interface StatusBarProps { userId: string; }

export default async function StatusBar({ userId }: StatusBarProps) {
  const books = await prisma.book.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { chapters: true },
  });

  const totalChapters    = books.reduce((s, b) => s + b.chapters.length, 0);
  const recordedChapters = books.reduce((s, b) => s + b.chapters.filter((c) => c.audioDriveId || c.audioFileUrl).length, 0);
  const totalSeconds     = books.reduce((s, b) => s + b.chapters.reduce((cs, c) => cs + (c.durationSeconds ?? 0), 0), 0);
  const activeBooks      = books.filter((b) => b.status === "IN_PROGRESS").length;
  const pct              = totalChapters > 0 ? Math.round((recordedChapters / totalChapters) * 100) : 0;

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
              <span>{activeBooks} active {activeBooks === 1 ? "book" : "books"}</span>
            </span>
            <span className="hidden sm:flex items-center gap-2">
              <Mic style={{ width: "16px", height: "16px", color: "var(--accent)", flexShrink: 0 }} />
              <span>
                <span style={{ color: "var(--text-secondary)" }}>{recordedChapters}</span>
                {" / "}
                <span style={{ color: "var(--text-secondary)" }}>{totalChapters}</span>
                {" chapters recorded"}
              </span>
            </span>
            {totalSeconds > 0 && (
              <span className="hidden md:flex items-center gap-2">
                <Clock style={{ width: "16px", height: "16px", color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ color: "var(--text-secondary)" }}>{formatDuration(totalSeconds)}</span>
                <span>total</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {totalChapters > 0 && (
              <div className="hidden sm:flex items-center gap-3">
                <div style={{ height: "6px", width: "120px", borderRadius: "3px", overflow: "hidden", background: "var(--bg-raised)" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: "3px", transition: "width 0.5s ease" }} />
                </div>
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", minWidth: "36px" }}>{pct}%</span>
              </div>
            )}
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", opacity: 0.4, fontFamily: "var(--font-sans)" }}>v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
