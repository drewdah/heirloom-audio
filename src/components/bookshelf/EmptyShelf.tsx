import Link from "next/link";
import { BookOpen, Mic, PlusCircle } from "lucide-react";

function VintageMicIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size * 42 / 36} viewBox="0 0 14 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.5" y="0.5" width="7" height="9" rx="3.5" fill="white" fillOpacity="0.9" />
      <line x1="3.5" y1="3" x2="10.5" y2="3" stroke="rgba(58,123,213,0.8)" strokeWidth="0.8" />
      <line x1="3.5" y1="5" x2="10.5" y2="5" stroke="rgba(58,123,213,0.8)" strokeWidth="0.8" />
      <line x1="3.5" y1="7" x2="10.5" y2="7" stroke="rgba(58,123,213,0.8)" strokeWidth="0.8" />
      <rect x="6" y="9.5" width="2" height="2" fill="white" fillOpacity="0.7" />
      <path d="M3 11.5 Q7 13.5 11 11.5" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <line x1="7" y1="13" x2="7" y2="15.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4.5" y1="15.5" x2="9.5" y2="15.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function EmptyShelf() {
  return (
    <div className="text-center py-20 px-6">
      <div
        className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-8"
        style={{ background: "var(--accent)", boxShadow: "0 0 32px rgba(58,123,213,0.35)", border: "1px solid rgba(58,123,213,0.4)" }}>
        <VintageMicIcon size={36} />
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
