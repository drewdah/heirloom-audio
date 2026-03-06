"use client";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import BookSpine from "./BookSpine";
import type { Book, Chapter } from "@prisma/client";

type BookWithChapters = Book & { chapters: Chapter[] };
interface BookshelfProps { books: BookWithChapters[]; }

// With 3D covers (~144px wide each), fit fewer per row
const SHELF_CAPACITY = 6;

export default function Bookshelf({ books }: BookshelfProps) {
  const rows: BookWithChapters[][] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(books.length / SHELF_CAPACITY)); i++) {
    rows.push(books.slice(i * SHELF_CAPACITY, (i + 1) * SHELF_CAPACITY));
  }
  if (rows.length === 0) rows.push([]);

  return (
    <div className="space-y-0">
      {rows.map((rowBooks, rowIdx) => (
        <ShelfRow
          key={rowIdx}
          books={rowBooks}
          rowIndex={rowIdx}
          globalOffset={rowIdx * SHELF_CAPACITY}
          isLastRow={rowIdx === rows.length - 1}
          hasSpace={rowBooks.length < SHELF_CAPACITY}
        />
      ))}
    </div>
  );
}

function ShelfRow({ books, rowIndex, globalOffset, isLastRow, hasSpace }: {
  books: BookWithChapters[];
  rowIndex: number;
  globalOffset: number;
  isLastRow: boolean;
  hasSpace: boolean;
}) {
  return (
    <div className="relative">
      {/* Dark page background — no brown */}
      <div
        className="relative overflow-visible"
        style={{
          background: "var(--bg-base)",
          padding: "32px 32px 0 32px",
          minHeight: "280px",
        }}>
        {/* Books row — left aligned, gap for the 3D perspective */}
        <div className="relative flex items-end gap-6" style={{ paddingBottom: "0" }}>
          {books.map((book, i) => (
            <BookSpine key={book.id} book={book} index={globalOffset + i} />
          ))}

          {/* Add book slot */}
          {(hasSpace || isLastRow) && (
            <Link
              href="/books/new"
              className="new-book-slot group flex-shrink-0 flex items-end"
              style={{ height: "210px", alignSelf: "flex-end" }}>
              <div
                className="flex flex-col items-center justify-center rounded gap-2 transition-all duration-200"
                style={{
                  width: "130px",
                  height: "200px",
                  border: "2px dashed rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(255,255,255,0.18)",
                }}>
                <PlusCircle className="w-6 h-6" />
                <span style={{
                  fontSize: "0.65rem",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "0.05em",
                  textAlign: "center",
                  lineHeight: 1.4,
                }}>
                  Add Book
                </span>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Shelf board — only wood element */}
      <div
        className="relative"
        style={{
          height: "18px",
          background: "linear-gradient(180deg, #5a2d0d 0%, #3d1a08 40%, #2a1205 100%)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.4)",
          borderRadius: "0 0 3px 3px",
        }}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="absolute top-0 bottom-0"
            style={{ left: `${5 + i * 10}%`, width: "1px", background: "rgba(255,255,255,0.025)" }} />
        ))}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "rgba(255,255,255,0.08)" }} />
      </div>

      {/* Drop shadow under shelf */}
      <div className="h-5 mx-2"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)" }} />
    </div>
  );
}
