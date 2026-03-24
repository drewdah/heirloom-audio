"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, LogOut, User, SlidersHorizontal } from "lucide-react";
import { signOut } from "next-auth/react";
import AudioSettingsModal from "@/components/studio/AudioSettingsModal";
import DriveStatus from "@/components/layout/DriveStatus";

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
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);

  return (
    <>
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
            <img
              src="/images/logo-simplified.png"
              alt="Heirloom Audio"
              className="w-8 h-8 rounded-full"
              style={{ boxShadow: "0 0 10px rgba(107,21,21,0.4)" }}
            />
            <span
              className="text-base font-semibold tracking-tight hidden sm:block"
              style={{ color: "var(--text-primary)", fontFamily: "var(--font-playfair)" }}>
              Heirloom Audio
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
                  onError={e => {
                    const el = e.currentTarget;
                    el.style.display = "none";
                    const fallback = el.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{
                  display: user.image ? "none" : "flex",
                  background: "var(--bg-raised)",
                  border: "1px solid var(--border-default)",
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-sans)",
                }}>
                {user.name ? user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
              <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>
                {user.name?.split(" ")[0] ?? user.email}
              </span>
            </div>
            <DriveStatus />
            <button
              onClick={() => setAudioSettingsOpen(true)}
              className="p-2 rounded-lg transition-all"
              style={{ color: "var(--text-tertiary)" }}
              title="Audio settings">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
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
    <AudioSettingsModal open={audioSettingsOpen} onClose={() => setAudioSettingsOpen(false)} />
    </>
  );
}
