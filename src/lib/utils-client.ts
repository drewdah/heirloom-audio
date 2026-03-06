import type { Book, Chapter } from "@prisma/client";

export type BookWithChapters = Book & { chapters: Chapter[] };

export function getSpineColor(index: number): { bg: string; spine: string; text: string } {
  const palette = [
    { bg: "#2d1b0e", spine: "#8b4513", text: "#f5e6c8" },
    { bg: "#0e1a2d", spine: "#1a3a8b", text: "#c8d8f5" },
    { bg: "#0e2d1a", spine: "#1a6b3a", text: "#c8f5d8" },
    { bg: "#2d0e1a", spine: "#8b1a3a", text: "#f5c8d8" },
    { bg: "#2d250e", spine: "#6b5a1a", text: "#f5eac8" },
    { bg: "#1a0e2d", spine: "#5a1a8b", text: "#d8c8f5" },
    { bg: "#2d1a0e", spine: "#8b5a13", text: "#f5dcc8" },
    { bg: "#0e2d28", spine: "#1a8b60", text: "#c8f5f0" },
  ];
  return palette[index % palette.length];
}
