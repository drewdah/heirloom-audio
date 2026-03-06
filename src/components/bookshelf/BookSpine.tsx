"use client";
import Link from "next/link";
import { type BookWithChapters, getSpineColor } from "@/lib/utils-client";
import { formatDuration } from "@/lib/utils";
import { BookOpen } from "lucide-react";

interface BookCoverProps {
  book: BookWithChapters;
  index: number;
}

export default function BookSpine({ book, index }: BookCoverProps) {
  const colors = getSpineColor(index);
  const recordedChapters = book.chapters.filter(
    (c) => c.audioDriveId || c.audioFileUrl
  ).length;
  const totalChapters = book.chapters.length;
  const progress = totalChapters > 0 ? recordedChapters / totalChapters : 0;
  const totalSeconds = book.chapters.reduce((s, c) => s + (c.durationSeconds ?? 0), 0);

  // Vary heights slightly for realism
  const heights = [200, 185, 210, 195, 205, 188, 215, 192];
  const height = heights[index % heights.length];
  const width = 130;
  const spineWidth = 14;

  return (
    <Link href={`/books/${book.id}`} className="block group flex-shrink-0" title={book.title}>
      <div
        className="relative cursor-pointer"
        style={{
          width: `${width + spineWidth}px`,
          height: `${height}px`,
          perspective: "800px",
          perspectiveOrigin: "50% 50%",
        }}>

        {/* 3D book wrapper */}
        <div
          className="absolute inset-0 transition-transform duration-400"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateY(-18deg)",
            transition: "transform 0.35s cubic-bezier(0.34, 1.2, 0.64, 1)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "rotateY(-30deg) translateY(-8px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "rotateY(-18deg)";
          }}>

          {/* ── FRONT COVER ── */}
          <div
            className="absolute top-0 left-0 overflow-hidden flex flex-col"
            style={{
              width: `${width}px`,
              height: `${height}px`,
              background: book.coverImageUrl
                ? "transparent"
                : `linear-gradient(160deg, ${colors.spine} 0%, ${colors.bg} 100%)`,
              borderRadius: "2px 4px 4px 2px",
              boxShadow: "2px 4px 20px rgba(0,0,0,0.6), 1px 0 0 rgba(0,0,0,0.3)",
              transformOrigin: "left center",
            }}>

            {book.coverImageUrl ? (
              /* Real cover art */
              <img
                src={book.coverImageUrl}
                alt={book.title}
                className="w-full h-full object-cover"
                style={{ borderRadius: "2px 4px 4px 2px" }}
              />
            ) : (
              /* Generated cover */
              <>
                {/* Top color band */}
                <div className="h-2 w-full" style={{ background: colors.spine, opacity: 0.8 }} />

                {/* Center content */}
                <div className="flex-1 flex flex-col items-center justify-center p-3 gap-2">
                  <BookOpen className="w-7 h-7 opacity-30" style={{ color: colors.text }} />
                  <div className="text-center">
                    <p
                      className="font-display leading-tight"
                      style={{
                        color: colors.text,
                        fontSize: book.title.length > 25 ? "0.65rem" : "0.75rem",
                        textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                      {book.title}
                    </p>
                  </div>
                  <p
                    className="text-center"
                    style={{
                      color: `${colors.text}99`,
                      fontSize: "0.55rem",
                      fontFamily: "var(--font-sans)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                    {book.author}
                  </p>
                </div>

                {/* Bottom color band */}
                <div className="h-2 w-full" style={{ background: colors.spine, opacity: 0.8 }} />
              </>
            )}

            {/* Progress bar at bottom edge */}
            {totalChapters > 0 && (
              <div
                className="absolute bottom-0 left-0 right-0 h-1"
                style={{ background: "rgba(0,0,0,0.4)" }}>
                <div
                  style={{
                    width: `${progress * 100}%`,
                    height: "100%",
                    background: progress === 1 ? "#30d158" : "#3a7bd5",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            )}

            {/* Hover overlay */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              style={{ background: "rgba(0,0,0,0.75)", borderRadius: "2px 4px 4px 2px" }}>
              <p className="text-xs font-medium" style={{ color: "#f5f5f7", fontFamily: "var(--font-sans)", fontSize: "0.65rem" }}>
                {recordedChapters}/{totalChapters} chapters
              </p>
              {totalSeconds > 0 && (
                <p style={{ color: "#a1a1a6", fontSize: "0.6rem", fontFamily: "var(--font-sans)" }}>
                  {formatDuration(totalSeconds)}
                </p>
              )}
              <p style={{ color: "var(--accent)", fontSize: "0.6rem", fontFamily: "var(--font-sans)", marginTop: "4px" }}>
                Open →
              </p>
            </div>
          </div>

          {/* ── SPINE ── */}
          <div
            className="absolute top-0 overflow-hidden"
            style={{
              left: `${width}px`,
              width: `${spineWidth}px`,
              height: `${height}px`,
              background: `linear-gradient(to right, ${colors.spine}dd, ${colors.spine}88)`,
              transform: `rotateY(90deg)`,
              transformOrigin: "left center",
              borderRadius: "0 2px 2px 0",
              boxShadow: "inset -2px 0 4px rgba(0,0,0,0.3)",
            }}>
            {/* Spine highlight */}
            <div
              className="absolute left-0 top-0 bottom-0 w-px"
              style={{ background: "rgba(255,255,255,0.15)" }}
            />
          </div>

        </div>

        {/* Shadow on shelf */}
        <div
          className="absolute bottom-0 left-0 right-0 -z-10"
          style={{
            height: "12px",
            background: "radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.5) 0%, transparent 70%)",
            transform: "translateY(8px) scaleY(0.5)",
            filter: "blur(4px)",
          }}
        />
      </div>
    </Link>
  );
}
