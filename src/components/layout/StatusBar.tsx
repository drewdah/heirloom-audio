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
        background: "rgba(10,10,10,0.9)",
        borderColor: "rgba(255,255,255,0.07)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-9 gap-6">

          <div className="flex items-center gap-5 text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" style={{ color: "var(--accent)" }} />
              <span>{activeBooks} active</span>
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <Mic className="w-3 h-3" style={{ color: "var(--accent)" }} />
              <span>
                <span style={{ color: "var(--text-secondary)" }}>{recordedChapters}</span>
                {" / "}
                <span style={{ color: "var(--text-secondary)" }}>{totalChapters}</span>
                {" chapters"}
              </span>
            </span>
            {totalSeconds > 0 && (
              <span className="hidden md:flex items-center gap-1.5">
                <Clock className="w-3 h-3" style={{ color: "var(--accent)" }} />
                <span style={{ color: "var(--text-secondary)" }}>{formatDuration(totalSeconds)}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {totalChapters > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="h-1 w-28 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: "var(--accent)" }}
                  />
                </div>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pct}%</span>
              </div>
            )}
            <span className="text-xs" style={{ color: "var(--text-tertiary)", opacity: 0.5, fontFamily: "var(--font-sans)" }}>
              v0.1
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
