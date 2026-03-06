import Link from "next/link";
import { BookOpen, Mic, PlusCircle } from "lucide-react";

export default function EmptyShelf() {
  return (
    <div className="text-center py-20 px-6">
      <div
        className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-8"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
        <BookOpen className="w-10 h-10" style={{ color: "var(--text-tertiary)" }} />
      </div>

      <h2 className="text-3xl font-display mb-3" style={{ color: "var(--text-primary)" }}>
        Your shelf is empty
      </h2>
      <p className="text-sm mb-10 max-w-md mx-auto" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)", lineHeight: "1.7" }}>
        Every great story begins with a single word. Start recording your first audiobook — a voice that will last for generations.
      </p>

      <Link href="/books/new" className="ha-btn-primary inline-flex" style={{ padding: "0.75rem 2rem", fontSize: "0.9rem" }}>
        <PlusCircle className="w-4 h-4" />
        Record Your First Book
      </Link>

      <div className="mt-16 flex justify-center gap-12">
        {[
          { icon: Mic,       title: "Record",    desc: "Use your microphone to capture your voice, chapter by chapter." },
          { icon: BookOpen,  title: "Organize",  desc: "Structure your book with chapters, metadata, and cover art." },
          { icon: PlusCircle,title: "Export M4B", desc: "Export a professional audiobook file to share with family." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="text-center max-w-xs">
            <Icon className="w-5 h-5 mx-auto mb-3" style={{ color: "var(--accent)" }} />
            <h3 className="font-display text-base mb-2" style={{ color: "var(--text-primary)" }}>{title}</h3>
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
