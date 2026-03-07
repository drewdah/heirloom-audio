import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** HH:MM:SS.mm — used for the studio transport display */
export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000); // milliseconds
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  const msStr = ms.toString().padStart(3, "0");
  if (h > 0) return `${h}:${mm}:${ss}.${msStr}`;
  return `${mm}:${ss}.${msStr}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function generateVersionTag(version: number): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const time = now.toTimeString().slice(0, 5).replace(":", "h") + "m";
  return `v${version}-${date}-${time}`;
}

export function getBookStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    IN_PROGRESS: "In Progress",
    COMPLETE: "Complete",
    ARCHIVED: "Archived",
  };
  return labels[status] ?? status;
}

export function getSpineColor(index: number): { bg: string; spine: string; text: string } {
  const palette = [
    { bg: "#2d1b0e", spine: "#8b4513", text: "#f5e6c8" },
    { bg: "#0e1a2d", spine: "#1a3a6b", text: "#c8d8f5" },
    { bg: "#0e2d1a", spine: "#1a6b3a", text: "#c8f5d8" },
    { bg: "#2d0e1a", spine: "#6b1a3a", text: "#f5c8d8" },
    { bg: "#2d250e", spine: "#6b5a1a", text: "#f5eac8" },
    { bg: "#1a0e2d", spine: "#3a1a6b", text: "#d8c8f5" },
    { bg: "#2d1a0e", spine: "#8b5a13", text: "#f5dcc8" },
    { bg: "#0e2d28", spine: "#1a6b60", text: "#c8f5f0" },
  ];
  return palette[index % palette.length];
}
