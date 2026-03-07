"use client";
import Link from "next/link";
import { type BookWithChapters, getSpineColor } from "@/lib/utils-client";
import { BookOpen } from "lucide-react";

const BOOK_W = 148;
const BOOK_H = 195;
const SPINE_W = 37;

interface BookSpineProps {
  book: BookWithChapters;
  index: number;
}

export default function BookSpine({ book, index }: BookSpineProps) {
  const fallback = getSpineColor(index);
  const colors = (() => {
    if (!book.spineColor) return fallback;
    try { return JSON.parse(book.spineColor) as typeof fallback; }
    catch { return fallback; }
  })();
  const recordedChapters = book.chapters.filter(c => c.audioDriveId || c.audioFileUrl).length;
  const totalChapters = book.chapters.length;
  const progress = totalChapters > 0 ? recordedChapters / totalChapters : 0;

  return (
    <Link
      href={`/books/${book.id}`}
      data-book-id={book.id}
      title={book.title}
      style={{
        display: "block",
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
        width: `${BOOK_W + SPINE_W}px`,
        height: `${BOOK_H}px`,
        marginRight: "-15px",
        perspective: "700px",
        perspectiveOrigin: "50% 100%",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        const wrap = e.currentTarget.querySelector<HTMLElement>(".bk-wrap");
        if (wrap) wrap.style.transform = "rotateY(0deg) translateY(-18px)";
        e.currentTarget.style.zIndex = "30";
      }}
      onMouseLeave={e => {
        const wrap = e.currentTarget.querySelector<HTMLElement>(".bk-wrap");
        if (wrap) wrap.style.transform = "rotateY(32deg)";
        e.currentTarget.style.zIndex = "1";
      }}
    >
      <div
        className="bk-wrap"
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: "rotateY(32deg)",
          transformOrigin: "center bottom",
          transition: "transform 0.4s cubic-bezier(0.34, 1.1, 0.64, 1)",
        }}
      >
        {/* SPINE */}
        <div style={{
          position: "absolute",
          top: 0, left: 0,
          width: `${SPINE_W}px`,
          height: `${BOOK_H}px`,
          background: `linear-gradient(to right, ${colors.spine}33, ${colors.spine}cc)`,
          transform: "rotateY(-90deg)",
          transformOrigin: "right center",
          borderRadius: "2px 0 0 2px",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.15)" }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "8px", background: "linear-gradient(to right,rgba(0,0,0,0.5),transparent)" }} />
        </div>

        {/* FRONT COVER */}
        <div style={{
          position: "absolute",
          top: 0,
          left: `${SPINE_W}px`,
          width: `${BOOK_W}px`,
          height: `${BOOK_H}px`,
          borderRadius: "0 3px 3px 0",
          overflow: "hidden",
          background: book.coverImageUrl
            ? "#000"
            : `linear-gradient(150deg, ${colors.spine}cc 0%, ${colors.bg} 55%, ${colors.spine}44 100%)`,
          boxShadow: "4px 8px 28px rgba(0,0,0,0.7), inset -1px 0 0 rgba(255,255,255,0.04)",
          display: "flex",
          flexDirection: "column",
        }}>
          {book.coverImageUrl ? (
            <img src={book.coverImageUrl} alt={book.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <>
              <div style={{ height: "3px", background: colors.spine, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px", gap: "8px" }}>
                <BookOpen style={{ width: "28px", height: "28px", opacity: 0.18, color: colors.text }} />
                <p style={{
                  color: colors.text,
                  fontSize: book.title.length > 20 ? "0.65rem" : "0.75rem",
                  fontFamily: "var(--font-display)",
                  textAlign: "center",
                  lineHeight: 1.3,
                  textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  display: "-webkit-box",
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>{book.title}</p>
                <p style={{
                  color: `${colors.text}77`,
                  fontSize: "0.55rem",
                  fontFamily: "var(--font-sans)",
                  textAlign: "center",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>{book.author}</p>
              </div>
              <div style={{ height: "3px", background: colors.spine, flexShrink: 0 }} />
            </>
          )}
          {totalChapters > 0 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px", background: "rgba(0,0,0,0.5)" }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", background: progress === 1 ? "#30d158" : "#3a7bd5", transition: "width 0.5s" }} />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
