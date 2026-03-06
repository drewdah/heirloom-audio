"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

interface BookFormProps {
  initialData?: {
    id?: string;
    title?: string;
    subtitle?: string;
    author?: string;
    narrator?: string;
    description?: string;
    genre?: string;
    language?: string;
    isbn?: string;
    publisher?: string;
    publishYear?: number;
  };
  mode?: "create" | "edit";
}

const GENRES = [
  "Fiction","Non-Fiction","Biography","History","Science",
  "Religion & Spirituality","Self-Help","Children","Mystery",
  "Romance","Fantasy","Science Fiction","Poetry","Other",
];

const LANGUAGES = [
  { code: "en", name: "English" }, { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },  { code: "de", name: "German" },
  { code: "it", name: "Italian" }, { code: "pt", name: "Portuguese" },
  { code: "zh", name: "Chinese" }, { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },  { code: "ar", name: "Arabic" },
];

export function BookForm({ initialData, mode = "create" }: BookFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title:       initialData?.title       ?? "",
    subtitle:    initialData?.subtitle    ?? "",
    author:      initialData?.author      ?? "",
    narrator:    initialData?.narrator    ?? "",
    description: initialData?.description ?? "",
    genre:       initialData?.genre       ?? "",
    language:    initialData?.language    ?? "en",
    isbn:        initialData?.isbn        ?? "",
    publisher:   initialData?.publisher   ?? "",
    publishYear: initialData?.publishYear?.toString() ?? "",
  });

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        subtitle:    form.subtitle    || undefined,
        narrator:    form.narrator    || undefined,
        description: form.description || undefined,
        genre:       form.genre       || undefined,
        isbn:        form.isbn        || undefined,
        publisher:   form.publisher   || undefined,
        publishYear: form.publishYear ? parseInt(form.publishYear) : undefined,
      };
      const url    = mode === "edit" && initialData?.id ? `/api/books/${initialData.id}` : "/api/books";
      const method = mode === "edit" ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? "Error"); }
      const book = await res.json();
      router.push(`/books/${book.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "0.375rem",
    fontFamily: "var(--font-sans)",
    letterSpacing: "0.02em",
  } as React.CSSProperties;

  const sectionStyle = {
    background: "var(--bg-raised)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "10px",
    padding: "1.5rem",
    marginBottom: "1rem",
  };

  const sectionTitleStyle = {
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--text-tertiary)",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    marginBottom: "1.25rem",
    fontFamily: "var(--font-sans)",
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Core details */}
      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Book Details</p>
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Title *</label>
            <input type="text" required value={form.title} onChange={set("title")}
              placeholder="e.g. The Holy Bible — King James Version" className="ha-input" />
          </div>
          <div>
            <label style={labelStyle}>Subtitle</label>
            <input type="text" value={form.subtitle} onChange={set("subtitle")}
              placeholder="e.g. A Complete Reading" className="ha-input" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Author *</label>
              <input type="text" required value={form.author} onChange={set("author")}
                placeholder="e.g. Anonymous" className="ha-input" />
            </div>
            <div>
              <label style={labelStyle}>Narrator</label>
              <input type="text" value={form.narrator} onChange={set("narrator")}
                placeholder="e.g. John Smith" className="ha-input" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={form.description} onChange={set("description")} rows={3}
              placeholder="A complete family recording of…"
              className="ha-input" style={{ resize: "none" }} />
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div style={sectionStyle}>
        <p style={sectionTitleStyle}>Publishing Metadata</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Genre</label>
              <div style={{ position: "relative" }}>
                <select value={form.genre} onChange={set("genre")} className="ha-input"
                  style={{ paddingRight: "2rem", cursor: "pointer" }}>
                  <option value="">Select genre…</option>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <svg style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-tertiary)" }}
                  width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Language</label>
              <div style={{ position: "relative" }}>
                <select value={form.language} onChange={set("language")} className="ha-input"
                  style={{ paddingRight: "2rem", cursor: "pointer" }}>
                  {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
                <svg style={{ position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-tertiary)" }}
                  width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Publisher</label>
              <input type="text" value={form.publisher} onChange={set("publisher")}
                placeholder="Self-Published" className="ha-input" />
            </div>
            <div>
              <label style={labelStyle}>Year</label>
              <input type="number" value={form.publishYear} onChange={set("publishYear")}
                placeholder="2024" min={1000} max={2100} className="ha-input" />
            </div>
            <div>
              <label style={labelStyle}>ISBN</label>
              <input type="text" value={form.isbn} onChange={set("isbn")}
                placeholder="Optional" className="ha-input" />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid rgba(255,69,58,0.3)", background: "rgba(255,69,58,0.08)", color: "var(--red)", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={loading} className="ha-btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {mode === "edit" ? "Save Changes" : "Create Book"}
        </button>
        <button type="button" onClick={() => router.back()} className="ha-btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
