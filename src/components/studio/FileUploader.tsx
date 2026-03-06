"use client";
import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

interface FileUploaderProps {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
}

export default function FileUploader({ onUpload, disabled }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    const baseType = file.type.split(";")[0].trim().toLowerCase();
    const allowed = ["audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm", "audio/aac"];
    if (!allowed.includes(baseType)) {
      setError("Unsupported format. Use WAV, MP3, M4A, or OGG.");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("File too large (max 500MB).");
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl transition-all cursor-pointer"
        style={{
          height: "100px",
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border-default)"}`,
          background: dragging ? "var(--accent-dim)" : "transparent",
          opacity: disabled || uploading ? 0.5 : 1,
          cursor: disabled || uploading ? "not-allowed" : "pointer",
        }}>
        {uploading
          ? <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent)" }} />
          : <Upload className="w-6 h-6" style={{ color: "var(--text-tertiary)" }} />}
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {uploading ? "Uploading to Drive…" : "Drop audio file or click to browse"}
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
          WAV, MP3, M4A, OGG · max 500MB
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {error && <p className="text-xs mt-2" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
