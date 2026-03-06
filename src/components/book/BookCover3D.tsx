"use client";
import { useState, useRef } from "react";
import { Camera, Loader2, Trash2, BookOpen } from "lucide-react";
import { getSpineColor } from "@/lib/utils-client";

// Larger version of the 3D book used on the book detail page
const W = 160;   // cover face width
const H = 240;   // height
const D = 44;    // spine depth



interface BookCover3DProps {
  bookId: string;
  title: string;
  author: string;
  coverImageUrl?: string | null;
  spineColor?: string | null;
  bookIndex?: number;
}

export default function BookCover3D({ bookId, title, author, coverImageUrl: initial, spineColor: initialSpineColor, bookIndex = 0 }: BookCover3DProps) {
  const [coverUrl, setCoverUrl] = useState(initial);
  const [spineColorJson, setSpineColorJson] = useState(initialSpineColor);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fallback = getSpineColor(bookIndex);
  const colors = (() => {
    if (!spineColorJson) return fallback;
    try { return JSON.parse(spineColorJson) as typeof fallback; }
    catch { return fallback; }
  })();

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
      const { coverImageUrl, spineColor } = await res.json();
      setCoverUrl(`${coverImageUrl}?t=${Date.now()}`);
      if (spineColor !== undefined) setSpineColorJson(spineColor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/cover`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setCoverUrl(null);
      setSpineColorJson(null);
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const transform = hovered ? "rotateY(0deg) translateY(-8px)" : "rotateY(32deg)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px" }}>
      {/* 3D book wrapper */}
      <div
        style={{
          width: `${W + D}px`,
          height: `${H}px`,
          perspective: "800px",
          perspectiveOrigin: "50% 100%",
          cursor: "pointer",
          flexShrink: 0,
          marginLeft: "-20px",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => !uploading && !deleting && inputRef.current?.click()}
      >
        <div style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform,
          transformOrigin: "center bottom",
          transition: "transform 0.4s cubic-bezier(0.34, 1.1, 0.64, 1)",
        }}>
          {/* Spine */}
          <div style={{
            position: "absolute",
            top: 0, left: 0,
            width: `${D}px`,
            height: `${H}px`,
            background: `linear-gradient(to right, ${colors.spine}33, ${colors.spine}cc)`,
            transform: "rotateY(-90deg)",
            transformOrigin: "right center",
            borderRadius: "3px 0 0 3px",
            overflow: "hidden",
          }}>
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.15)" }} />
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "10px", background: "linear-gradient(to right, rgba(0,0,0,0.5), transparent)" }} />
          </div>

          {/* Front cover */}
          <div style={{
            position: "absolute",
            top: 0,
            left: `${D}px`,
            width: `${W}px`,
            height: `${H}px`,
            borderRadius: "0 4px 4px 0",
            overflow: "hidden",
            background: coverUrl ? "#000" : `linear-gradient(150deg, ${colors.spine}cc 0%, ${colors.bg} 55%, ${colors.spine}44 100%)`,
            boxShadow: "5px 10px 32px rgba(0,0,0,0.75)",
            display: "flex",
            flexDirection: "column",
          }}>
            {coverUrl ? (
              <img src={coverUrl} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <>
                <div style={{ height: "4px", background: colors.spine, flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", gap: "10px" }}>
                  <BookOpen style={{ width: "32px", height: "32px", opacity: 0.18, color: colors.text }} />
                  <p style={{ color: colors.text, fontSize: title.length > 20 ? "0.8rem" : "0.95rem", fontFamily: "var(--font-display)", textAlign: "center", lineHeight: 1.3, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
                    {title}
                  </p>
                  <p style={{ color: `${colors.text}77`, fontSize: "0.65rem", fontFamily: "var(--font-sans)", textAlign: "center" }}>
                    {author}
                  </p>
                </div>
                <div style={{ height: "4px", background: colors.spine, flexShrink: 0 }} />
              </>
            )}

            {/* Hover overlay — camera icon */}
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.2s",
            }}>
              {uploading || deleting
                ? <Loader2 style={{ width: "28px", height: "28px", color: "white" }} className="animate-spin" />
                : <>
                    <Camera style={{ width: "28px", height: "28px", color: "white" }} />
                    <span style={{ color: "white", fontSize: "0.75rem", fontFamily: "var(--font-sans)" }}>
                      {coverUrl ? "Change cover" : "Add cover"}
                    </span>
                  </>
              }
            </div>
          </div>
        </div>
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {/* Remove cover button */}
      {coverUrl && !confirmDelete && (
        <button onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          <Trash2 style={{ width: "12px", height: "12px" }} />
          Remove cover
        </button>
      )}
      {confirmDelete && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>Remove cover?</span>
          <button onClick={handleDelete} disabled={deleting}
            style={{ padding: "2px 10px", borderRadius: "6px", background: "var(--red)", color: "white", fontSize: "0.75rem", fontFamily: "var(--font-sans)" }}>
            {deleting ? "…" : "Yes"}
          </button>
          <button onClick={() => setConfirmDelete(false)}
            style={{ padding: "2px 10px", borderRadius: "6px", border: "1px solid var(--border-default)", color: "var(--text-tertiary)", fontSize: "0.75rem", fontFamily: "var(--font-sans)" }}>
            No
          </button>
        </div>
      )}
      {error && <p style={{ fontSize: "0.75rem", color: "var(--red)", fontFamily: "var(--font-sans)" }}>{error}</p>}
    </div>
  );
}
