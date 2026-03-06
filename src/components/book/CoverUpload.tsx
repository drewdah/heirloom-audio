"use client";
import { useState, useRef } from "react";
import { ImageIcon, Loader2, Camera } from "lucide-react";

interface CoverUploadProps {
  bookId: string;
  coverImageUrl?: string | null;
}

export default function CoverUpload({ bookId, coverImageUrl: initial }: CoverUploadProps) {
  const [coverUrl, setCoverUrl] = useState(initial);
  const [uploading, setUploading] = useState(false);
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
      setCoverUrl(coverImageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-shrink-0">
      <div
        className="relative group cursor-pointer rounded-xl overflow-hidden"
        style={{ width: "128px", height: "128px" }}
        onClick={() => !uploading && inputRef.current?.click()}>

        {coverUrl ? (
          <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2"
            style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)" }}>
            <ImageIcon className="w-8 h-8" style={{ color: "var(--text-tertiary)" }} />
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Add Cover</span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.7)" }}>
          {uploading
            ? <Loader2 className="w-6 h-6 animate-spin text-white" />
            : <><Camera className="w-6 h-6 text-white" />
               <span className="text-xs text-white">{coverUrl ? "Change" : "Upload"}</span></>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {error && (
        <p className="text-xs mt-1 text-center" style={{ color: "var(--red)", maxWidth: "128px" }}>{error}</p>
      )}
    </div>
  );
}
