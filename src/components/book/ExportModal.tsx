"use client";
import { useState, useEffect, useCallback } from "react";
import { Download, X, AlertTriangle, CheckCircle, Package, Loader2 } from "lucide-react";

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

interface ExportModalProps {
  bookId: string;
  book: BookMeta;
  chapters: Chapter[];
  onClose: () => void;
}

type ModalStep = "review" | "exporting" | "done" | "error";

function MetaRow({ label, value, missing }: { label: string; value?: string | null; missing?: boolean }) {
  return (
    <div className="flex items-baseline gap-3" style={{ padding: "0.35rem 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{
        width: "100px",
        flexShrink: 0,
        fontSize: "0.65rem",
        fontFamily: "var(--font-sans)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        fontWeight: 600,
      }}>{label}</span>
      <span style={{
        fontSize: "0.8rem",
        fontFamily: "var(--font-sans)",
        color: missing ? "rgba(255,180,0,0.8)" : "var(--text-primary)",
        fontStyle: missing ? "italic" : "normal",
      }}>
        {value || (missing ? "Not set — will be omitted" : "—")}
      </span>
    </div>
  );
}

export default function ExportModal({ bookId, book, chapters, onClose }: ExportModalProps) {
  const [step, setStep] = useState<ModalStep>("review");
  const [, setExportId] = useState<string | null>(null);
  const [versionTag, setVersionTag] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [exportFileUrl, setExportFileUrl] = useState<string | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const incompleteChapters = chapters.filter((c) => !c.recordingComplete);
  const unprocessedChapters = chapters.filter((c) => c.processStatus !== "done");
  const isBlocked = incompleteChapters.length > 0 || unprocessedChapters.length > 0;

  // Poll for export completion
  const pollExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/books/${bookId}/export`);
      const data = await res.json();
      if (data.latestExport?.exportStatus === "done") {
        setExportFileUrl(`/api/books/${bookId}/export/download?exportId=${data.latestExport.id}`);
        setFileSizeBytes(data.latestExport.fileSizeBytes);
        setStep("done");
      } else if (data.latestExport?.exportStatus === "error") {
        setError("Export failed in the worker. Check worker logs for details.");
        setStep("error");
      }
    } catch {
      // keep polling
    }
  }, [bookId]);

  useEffect(() => {
    if (step !== "exporting") return;
    const interval = setInterval(pollExport, 3000);
    return () => clearInterval(interval);
  }, [step, pollExport]);

  const handleExport = async () => {
    setStep("exporting");
    setError(null);
    try {
      const res = await fetch(`/api/books/${bookId}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start export");
        setStep("error");
        return;
      }
      setExportId(data.exportId);
      setVersionTag(data.versionTag);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("error");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "560px",
        maxHeight: "85vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.8)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          <div className="flex items-center gap-2.5">
            <Package style={{ width: "18px", height: "18px", color: "var(--accent)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "var(--text-primary)" }}>
              Export Audiobook
            </span>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-tertiary)", lineHeight: 0 }}>
            <X style={{ width: "18px", height: "18px" }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "1.5rem" }}>

          {/* ── BLOCKED: incomplete / unprocessed chapters ── */}
          {isBlocked && step === "review" && (
            <div style={{
              background: "rgba(255,160,0,0.08)",
              border: "1px solid rgba(255,160,0,0.3)",
              borderRadius: "8px",
              padding: "1rem 1.25rem",
              marginBottom: "1.25rem",
            }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle style={{ width: "15px", height: "15px", color: "rgba(255,180,0,0.9)", flexShrink: 0 }} />
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,180,0,0.9)", fontFamily: "var(--font-sans)" }}>
                  Export blocked — chapters not ready
                </span>
              </div>
              {incompleteChapters.length > 0 && (
                <>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginBottom: "0.4rem", fontFamily: "var(--font-sans)" }}>
                    Not marked complete:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                    {incompleteChapters.map((c) => (
                      <li key={c.id} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                        Ch. {c.order}: {c.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {unprocessedChapters.length > 0 && (
                <>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.75rem", marginBottom: "0.4rem", fontFamily: "var(--font-sans)" }}>
                    Not yet processed (audio not cleaned):
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                    {unprocessedChapters.map((c) => (
                      <li key={c.id} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                        Ch. {c.order}: {c.title}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* ── REVIEW: metadata preview ── */}
          {step === "review" && (
            <>
              <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", marginBottom: "1rem" }}>
                The following metadata will be embedded in the M4B file. Go back and edit the book if anything is missing or incorrect.
              </p>
              <div style={{ marginBottom: "1.25rem" }}>
                <MetaRow label="Title"       value={book.title} />
                <MetaRow label="Subtitle"    value={book.subtitle}    missing={!book.subtitle} />
                <MetaRow label="Author"      value={book.author} />
                <MetaRow label="Narrator"    value={book.narrator}    missing={!book.narrator} />
                <MetaRow label="Genre"       value={book.genre}       missing={!book.genre} />
                <MetaRow label="Publisher"   value={book.publisher}   missing={!book.publisher} />
                <MetaRow label="Year"        value={book.publishYear ? String(book.publishYear) : null} missing={!book.publishYear} />
                <MetaRow label="Language"    value={book.language} />
                <MetaRow label="Description" value={book.description} missing={!book.description} />
                <MetaRow label="Cover Art"   value={book.coverImageUrl ? "✓ Will be embedded" : null} missing={!book.coverImageUrl} />
              </div>
              <div style={{
                background: "var(--bg-raised)",
                borderRadius: "6px",
                padding: "0.75rem 1rem",
                fontSize: "0.75rem",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)",
              }}>
                <strong style={{ color: "var(--text-secondary)" }}>{chapters.length} chapters</strong> will be stitched together,
                cross-normalized to <strong style={{ color: "var(--text-secondary)" }}>-18 LUFS</strong>,
                and packaged as an M4B with chapter markers.
              </div>
            </>
          )}

          {/* ── EXPORTING ── */}
          {step === "exporting" && (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <Loader2 style={{ width: "36px", height: "36px", color: "var(--accent)", margin: "0 auto 1rem", animation: "spin 1s linear infinite" }} />
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                Exporting your audiobook…
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                Stitching chapters, normalizing audio, and building M4B. This may take a few minutes.
              </p>
              {versionTag && (
                <p style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "1rem" }}>
                  {versionTag}
                </p>
              )}
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <CheckCircle style={{ width: "36px", height: "36px", color: "var(--green)", margin: "0 auto 1rem" }} />
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>
                Export complete!
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", marginBottom: "1.5rem" }}>
                {versionTag}{fileSizeBytes ? ` · ${formatSize(fileSizeBytes)}` : ""}
              </p>
              {exportFileUrl && (
                <button
                  onClick={async () => {
                    setDownloading(true);
                    try {
                      const res = await fetch(exportFileUrl);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${book.title.replace(/[^a-z0-9]/gi, "_")}_${versionTag}.m4b`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } finally {
                      setDownloading(false);
                    }
                  }}
                  disabled={downloading}
                  className="ha-btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  {downloading
                    ? <Loader2 style={{ width: "15px", height: "15px", animation: "spin 1s linear infinite" }} />
                    : <Download style={{ width: "15px", height: "15px" }} />}
                  {downloading ? "Preparing…" : "Download M4B"}
                </button>
              )}
            </div>
          )}

          {/* ── ERROR ── */}
          {step === "error" && (
            <div style={{
              background: "rgba(255,60,60,0.08)",
              border: "1px solid rgba(255,60,60,0.3)",
              borderRadius: "8px",
              padding: "1rem 1.25rem",
            }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "rgba(255,100,100,0.9)", marginBottom: "0.5rem", fontFamily: "var(--font-sans)" }}>
                Export failed
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: "0.75rem",
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}>
          {(step === "done" || step === "error") && (
            <button onClick={onClose} className="ha-btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
              Close
            </button>
          )}
          {step === "review" && (
            <>
              <button onClick={onClose} className="ha-btn-ghost" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}>
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isBlocked}
                className="ha-btn-primary"
                style={{
                  padding: "0.5rem 1.25rem",
                  fontSize: "0.85rem",
                  opacity: isBlocked ? 0.4 : 1,
                  cursor: isBlocked ? "not-allowed" : "pointer",
                }}>
                <Package style={{ width: "14px", height: "14px" }} />
                Export M4B
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
