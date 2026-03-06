import { BookForm } from "@/components/book/BookForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewBookPage() {
  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <Link href="/shelf"
          className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          <ArrowLeft className="w-4 h-4" />
          Back to Shelf
        </Link>
        <h1 className="text-3xl font-display mb-2" style={{ color: "var(--text-primary)" }}>New Book</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          Add the book you want to record.
        </p>
      </div>
      <BookForm mode="create" />
    </div>
  );
}
