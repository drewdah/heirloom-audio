"use client";
import { useState, useRef } from "react";
import { ImageIcon, Loader2, Camera, Trash2 } from "lucide-react";

interface CoverUploadProps {
  bookId: string;
  coverImageUrl?: string | null;
}

export default function CoverUpload({ bookId, coverImageUrl: initial }: CoverUploadProps) {
  const [coverUrl, setCoverUrl] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setError("JPEG, PNG, or WebP only"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Max 10MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("cover", file);
      const res = await fetch(`/api/books/${bookId}/cover`, { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Upload failed"); }
      const { coverImageUrl } = await res.json();
      setCoverUrl(`${coverImageUrl}?t=${Date.now()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/cover`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setCoverUrl(null);
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-shrink-0">
      {/* Cover image box */}
      <div
        className="relative group cursor-pointer rounded-xl overflow-hidden"
        style={{ width: "128px", height: "128px" }}
        onClick={() => !uploading && !deleting && inputRef.current?.click()}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)", borderRadius: "0.75rem" }}>
            <ImageIcon className="w-8 h-8" style={{ color: "var(--text-tertiary)" }} />
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Add Cover</span>
          </div>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.7)", borderRadius: "0.75rem" }}>
          {uploading
            ? <Loader2 className="w-6 h-6 animate-spin text-white" />
            : <><Camera className="w-6 h-6 text-white" /><span className="text-xs text-white">{coverUrl ? "Change" : "Upload"}</span></>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {/* Delete button — only shown when there is a cover */}
      {coverUrl && !confirmDelete && (
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-2 w-full flex items-center justify-center gap-1 text-xs py-1 rounded-lg transition-colors"
          style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-subtle)" }}
        >
          <Trash2 className="w-3 h-3" />
          Remove
        </button>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
            Remove cover?
          </p>
          <div className="flex gap-1">
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-1 rounded text-xs font-medium"
              style={{ background: "var(--red)", color: "white" }}>
              {deleting ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Yes"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1 rounded text-xs"
              style={{ border: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}>
              No
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs mt-1 text-center" style={{ color: "var(--red)", maxWidth: "128px" }}>{error}</p>
      )}
    </div>
  );
}
