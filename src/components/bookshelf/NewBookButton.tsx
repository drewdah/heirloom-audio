"use client";
import Link from "next/link";
import { Plus } from "lucide-react";

export default function NewBookButton() {
  return (
    <Link href="/books/new" className="group flex items-end justify-center" style={{ minWidth: "52px" }}>
      <div
        className="new-book-slot flex flex-col items-center justify-center rounded-sm transition-all duration-300"
        style={{
          width: "52px",
          height: "200px",
          border: "2px dashed rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.02)",
          color: "rgba(255,255,255,0.2)",
        }}>
        <Plus className="w-5 h-5 mb-1" />
        <span
          style={{
            fontSize: "0.5rem",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontFamily: "var(--font-sans)",
            letterSpacing: "0.1em",
          }}>
          New Book
        </span>
      </div>
    </Link>
  );
}
