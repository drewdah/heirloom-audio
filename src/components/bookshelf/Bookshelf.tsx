"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import BookSpine from "./BookSpine";
import { formatDuration } from "@/lib/utils";
import type { Book, Chapter } from "@prisma/client";

function MetaField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "5px", flexShrink: 0 }}>
      <span style={{
        fontSize: "0.65rem",
        fontFamily: "var(--font-sans)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: "0.8rem",
        fontFamily: "var(--font-sans)",
        color: highlight ? "var(--green)" : "var(--text-secondary)",
      }}>
        {value}
      </span>
    </div>
  );
}

type BookWithChapters = Book & { chapters: Chapter[] };
interface BookshelfProps { books: BookWithChapters[]; }

const SHELF_CAPACITY = 6;
const BOOK_W = 130;
const BOOK_H = 210;
const SPINE_W = 36;
const OVERLAP = 15;           // matches BookSpine marginRight: -15px
const ADD_BOOK_GAP = 10;      // left margin on Add Book slot
const ROW_PAD_LEFT = 24;      // paddingLeft on books row
const ROW_PAD_RIGHT = 16;     // paddingRight on books row
const ADD_BOOK_FOOTPRINT = 72 + ADD_BOOK_GAP + 8;   // capacity calc uses narrower value; visual width is set separately

// Books poke above the backing by this amount — backing is shorter than books
const PEEK_ABOVE = Math.round(BOOK_H * 0.10);  // ~21px above backing top

export default function Bookshelf({ books }: BookshelfProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [booksPerRow, setBooksPerRow] = useState(SHELF_CAPACITY);

  useEffect(() => {
    const compute = () => {
      if (!containerRef.current) return;
      const containerW = containerRef.current.offsetWidth;
      const bookStride = BOOK_W + SPINE_W - OVERLAP;
      const firstBook = BOOK_W + SPINE_W;
      // Subtract row padding + add book footprint, then fit as many books as possible
      const available = containerW - ROW_PAD_LEFT - ROW_PAD_RIGHT - ADD_BOOK_FOOTPRINT;
      const count = Math.max(1, Math.floor((available - firstBook) / bookStride) + 1);
      setBooksPerRow(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const rows: BookWithChapters[][] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(books.length / booksPerRow)); i++) {
    rows.push(books.slice(i * booksPerRow, (i + 1) * booksPerRow));
  }
  if (rows.length === 0) rows.push([]);

  return (
    <div ref={containerRef} style={{ borderRadius: "8px", overflow: "visible", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}>
      {rows.map((rowBooks, rowIdx) => (
        <ShelfRow
          key={rowIdx}
          books={rowBooks}
          globalOffset={rowIdx * booksPerRow}
          isLastRow={rowIdx === rows.length - 1}
          hasSpace={rowBooks.length < booksPerRow}
        />
      ))}
    </div>
  );
}

interface TooltipBook {
  title: string;
  author: string;
  publishYear?: number | null;
  genre?: string | null;
  totalChapters: number;
  recordedChapters: number;
  totalSeconds: number;
}

function ShelfRow({ books, globalOffset, isLastRow, hasSpace }: {
  books: BookWithChapters[];
  globalOffset: number;
  isLastRow: boolean;
  hasSpace: boolean;
}) {
  const [tooltip, setTooltip] = useState<TooltipBook | null>(null);

  // Backing height = BOOK_H - PEEK_ABOVE
  // Books are positioned so their bottoms align with backing bottom,
  // their tops naturally poke above
  const backingH = BOOK_H - PEEK_ABOVE;

  return (
    <div style={{ position: "relative" }}>
      {/* Wrapper with padding-top so books can peek above the backing */}
      <div style={{ position: "relative", paddingTop: `${PEEK_ABOVE + 18}px` }}>

        {/* Wood backing — shorter than books, sits behind them */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: `${backingH}px`,
          background: `
            repeating-linear-gradient(
              92deg,
              transparent 0px, transparent 18px,
              rgba(0,0,0,0.07) 18px, rgba(0,0,0,0.07) 19px,
              transparent 19px, transparent 34px,
              rgba(255,255,255,0.02) 34px, rgba(255,255,255,0.02) 35px
            ),
            repeating-linear-gradient(
              89deg,
              transparent 0px, transparent 60px,
              rgba(0,0,0,0.04) 60px, rgba(0,0,0,0.04) 62px
            ),
            linear-gradient(180deg, #2a1a0d 0%, #1e1208 40%, #231508 70%, #1a1008 100%)
          `,
          // Top-of-backing vignette
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "32px", background: "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)" }} />
        </div>

        {/* Books row — bottom-aligned so books sit on shelf board */}
        <div style={{
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          paddingLeft: `${ROW_PAD_LEFT}px`,
          paddingRight: `${ROW_PAD_RIGHT}px`,
          zIndex: 1,
        }}>
          {books.map((book, i) => (
            <div
              key={book.id}
              style={{ position: "relative" }}
              onMouseEnter={() => setTooltip({
                title: book.title,
                author: book.author,
                publishYear: book.publishYear,
                genre: book.genre,
                totalChapters: book.chapters.length,
                recordedChapters: book.chapters.filter(c => c.audioDriveId || c.audioFileUrl).length,
                totalSeconds: book.chapters.reduce((s, c) => s + (c.durationSeconds ?? 0), 0),
              })}
              onMouseLeave={() => setTooltip(null)}
            >
              <BookSpine book={book} index={globalOffset + i} />
            </div>
          ))}

          {/* Add Book — ONE unified box, no spine sliver gap, exact book dimensions */}
          {(hasSpace || isLastRow) && (
            <Link
              href="/books/new"
              style={{
                display: "flex",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
                width: "115px",  // visual width only — capacity calc uses ADD_BOOK_FOOTPRINT
                height: "175px",
                marginLeft: `${ADD_BOOK_GAP}px`,
                marginRight: "8px",
                marginBottom: "7px",
                borderRadius: "3px",
                background: "rgba(255,255,255,0.025)",
                border: "1.5px dashed rgba(255,255,255,0.15)",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                color: "rgba(255,255,255,0.25)",
                transition: "background 0.2s, border-color 0.2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.35)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
              }}
            >
              <Plus style={{ width: "22px", height: "22px" }} />
              <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-sans)", letterSpacing: "0.05em" }}>
                Add Book
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Shelf board */}
      <div style={{
        position: "relative",
        height: "20px",
        background: "linear-gradient(180deg, #6b3a14 0%, #4d2509 35%, #3a1c07 70%, #2a1205 100%)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.5)",
        zIndex: 2,
      }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${3 + i * 8.5}%`,
            width: i % 3 === 0 ? "2px" : "1px",
            background: i % 3 === 0 ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.025)",
          }} />
        ))}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", background: "rgba(255,255,255,0.12)" }} />
      </div>

      {/* Tooltip strip — absolutely positioned so it overlays without shifting layout */}
      <div style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        height: "68px",
        background: "rgba(0,0,0,0.88)",
        opacity: tooltip ? 1 : 0,
        pointerEvents: "none",
        transition: "opacity 0.15s ease",
        overflow: "hidden",
        paddingLeft: "28px",
        paddingRight: "28px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "6px",
        zIndex: 20,
      }}>
        {tooltip && (
          <>
            {/* Row 1: Title + year */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", minWidth: 0 }}>
              <span style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
                fontSize: "1rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "480px",
              }}>
                {tooltip.title}
              </span>
              {tooltip.publishYear && (
                <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", fontSize: "0.75rem", flexShrink: 0 }}>
                  {tooltip.publishYear}
                </span>
              )}
            </div>

            {/* Row 2: Labeled metadata fields */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "nowrap" }}>
              <MetaField label="Author" value={tooltip.author} />
              {tooltip.genre && <MetaField label="Genre" value={tooltip.genre} />}
              <MetaField
                label="Chapters"
                value={`${tooltip.recordedChapters} / ${tooltip.totalChapters} recorded`}
                highlight={tooltip.recordedChapters === tooltip.totalChapters && tooltip.totalChapters > 0}
              />
              {tooltip.totalSeconds > 0 && (
                <MetaField label="Duration" value={formatDuration(tooltip.totalSeconds)} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
