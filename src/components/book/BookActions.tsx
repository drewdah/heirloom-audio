"use client";
import { useState } from "react";
import Link from "next/link";
import { Edit, Trash2 } from "lucide-react";
import DeleteBookDialog from "@/components/book/DeleteBookDialog";

interface BookActionsProps {
  bookId: string;
  bookTitle: string;
  hasDriveFolder: boolean;
}

export default function BookActions({ bookId, bookTitle, hasDriveFolder }: BookActionsProps) {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
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
    </>
  );
}
