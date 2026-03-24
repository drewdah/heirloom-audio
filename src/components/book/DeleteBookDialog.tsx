"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, HardDrive, AlertTriangle } from "lucide-react";

interface DeleteBookDialogProps {
  bookId: string;
  bookTitle: string;
  hasDriveFolder: boolean;
  onCancel: () => void;
}

export default function DeleteBookDialog({
  bookId,
  bookTitle,
  hasDriveFolder,
  onCancel,
}: DeleteBookDialogProps) {
  const router = useRouter();
  const [deleteDrive, setDeleteDrive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/books/${bookId}?deleteDrive=${deleteDrive}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Delete failed");
      }
      router.push("/shelf");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4"
      style={{ paddingTop: "10vh", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,69,58,0.12)", border: "1px solid rgba(255,69,58,0.25)" }}>
            <Trash2 className="w-5 h-5" style={{ color: "var(--red)" }} />
          </div>
          <div>
            <h2 className="font-display text-lg" style={{ color: "var(--text-primary)" }}>
              Delete Book
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
              &ldquo;{bookTitle}&rdquo;
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="flex gap-3 rounded-xl p-4"
          style={{ background: "rgba(255,69,58,0.06)", border: "1px solid rgba(255,69,58,0.2)" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--red)" }} />
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
            This will permanently delete the book, all its chapters, and export records from HeirloomAudio. This cannot be undone.
          </p>
        </div>

        {/* Drive option — only shown if the book has a Drive folder */}
        {hasDriveFolder && (
          <label className="flex items-start gap-3 rounded-xl p-4 cursor-pointer transition-colors"
            style={{
              background: deleteDrive ? "rgba(255,69,58,0.06)" : "var(--bg-raised)",
              border: `1px solid ${deleteDrive ? "rgba(255,69,58,0.3)" : "var(--border-default)"}`,
            }}>
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={deleteDrive}
                onChange={(e) => setDeleteDrive(e.target.checked)}
                className="sr-only"
              />
              <div className="w-5 h-5 rounded flex items-center justify-center"
                style={{
                  background: deleteDrive ? "var(--red)" : "var(--bg-overlay)",
                  border: `2px solid ${deleteDrive ? "var(--red)" : "var(--border-strong)"}`,
                  transition: "all 0.15s",
                }}>
                {deleteDrive && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <HardDrive className="w-3.5 h-3.5" style={{ color: deleteDrive ? "var(--red)" : "var(--text-tertiary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-sans)" }}>
                  Also delete from Google Drive
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                Permanently deletes this book&rsquo;s folder and all recorded audio files from your Google Drive. The HeirloomAudio root folder and other books are not affected.
              </p>
            </div>
          </label>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--red)", fontFamily: "var(--font-sans)" }}>{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "var(--red)", color: "white", opacity: loading ? 0.7 : 1 }}>
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
            {loading ? "Deleting…" : deleteDrive ? "Delete Book & Drive Files" : "Delete Book"}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm transition-colors"
            style={{
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-sans)",
            }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
