"use client";
import { useState } from "react";
import Link from "next/link";
import { Edit, Trash2, Package } from "lucide-react";
import DeleteBookDialog from "@/components/book/DeleteBookDialog";
import ExportModal from "@/components/book/ExportModal";

interface Chapter {
  id: string;
  title: string;
  order: number;
  recordingComplete: boolean;
  processStatus: string;
}

interface BookMeta {
  title: string;
  subtitle?: string | null;
  author: string;
  narrator?: string | null;
  description?: string | null;
  genre?: string | null;
  language: string;
  publisher?: string | null;
  publishYear?: number | null;
  coverImageUrl?: string | null;
}

interface BookActionsProps {
  bookId: string;
  bookTitle: string;
  hasDriveFolder: boolean;
  book: BookMeta;
  chapters: Chapter[];
}

export default function BookActions({ bookId, bookTitle, hasDriveFolder, book, chapters }: BookActionsProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowExport(true)}
          className="ha-btn-primary flex items-center gap-1.5 text-sm"
          style={{ padding: "0.4rem 0.875rem" }}>
          <Package className="w-3.5 h-3.5" />
          Export M4B
        </button>
        <Link
          href={`/books/${bookId}/edit`}
          className="ha-btn-ghost flex items-center gap-1.5 text-sm"
          style={{ padding: "0.4rem 0.875rem" }}>
          <Edit className="w-3.5 h-3.5" />
          Edit
        </Link>
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 text-sm rounded-lg transition-colors"
          style={{
            padding: "0.4rem 0.875rem",
            color: "var(--text-tertiary)",
            border: "1px solid var(--border-subtle)",
          }}>
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      {showDelete && (
        <DeleteBookDialog
          bookId={bookId}
          bookTitle={bookTitle}
          hasDriveFolder={hasDriveFolder}
          onCancel={() => setShowDelete(false)}
        />
      )}

      {showExport && (
        <ExportModal
          bookId={bookId}
          book={book}
          chapters={chapters}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}
