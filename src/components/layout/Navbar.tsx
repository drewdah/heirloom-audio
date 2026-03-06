"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, PlusCircle, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";

interface NavbarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

export default function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(10,10,10,0.85)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/shelf" className="flex items-center gap-2.5 group">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent)", boxShadow: "0 0 12px rgba(58,123,213,0.4)" }}>
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span
              className="text-base font-semibold tracking-tight hidden sm:block"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-playfair)" }}>
              HeirloomAudio
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <Link
              href="/shelf"
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                color: pathname === "/shelf" ? "var(--text-primary)" : "var(--text-secondary)",
                background: pathname === "/shelf" ? "var(--bg-raised)" : "transparent",
                fontFamily: "var(--font-sans)",
              }}>
              My Shelf
            </Link>
            <Link
              href="/books/new"
              className="ha-btn-primary ml-1 text-sm py-1.5 px-3"
              style={{ borderRadius: "8px" }}>
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Book</span>
            </Link>
          </div>

          {/* User menu */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2.5">
              {user.image ? (
                <img
                  src={user.image}
                  alt={user.name ?? ""}
                  className="w-7 h-7 rounded-full"
                  style={{ border: "1.5px solid var(--border-default)" }}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "var(--bg-raised)", border: "1px solid var(--border-default)" }}>
                  <User className="w-3.5 h-3.5" style={{ color: "var(--text-secondary)" }} />
                </div>
              )}
              <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                {user.name?.split(" ")[0] ?? user.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="p-2 rounded-lg transition-all"
              style={{ color: "var(--text-tertiary)" }}
              title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </nav>
  );
}
