import type { Book, Chapter } from "@prisma/client";

export type BookWithChapters = Book & { chapters: Chapter[] };

// Book cover colors — each is a distinct, rich tone that works on a dark shelf.
// bg = darker base, cover = the primary face color, text = readable contrast color
export function getSpineColor(index: number): { bg: string; spine: string; text: string } {
  const palette = [
    // Deep teal
    { bg: "#0a1f1f", spine: "#0d4a4a", text: "#a0ede0" },
    // Warm burgundy
    { bg: "#1f0a10", spine: "#6b1528", text: "#f5b8c8" },
    // Slate blue
    { bg: "#0a0f1f", spine: "#1a2f6b", text: "#aabcf5" },
    // Forest green
    { bg: "#0a1a0f", spine: "#1a5c2a", text: "#a0e8b0" },
    // Deep plum
    { bg: "#140a1f", spine: "#4a1570", text: "#d4a8f5" },
    // Burnt sienna
    { bg: "#1f100a", spine: "#7a2e0a", text: "#f5c4a0" },
    // Steel blue-gray
    { bg: "#0d1218", spine: "#1e3448", text: "#9bbcd4" },
    // Olive
    { bg: "#121408", spine: "#3d4a10", text: "#d4e09a" },
    // Rose
    { bg: "#1f0e14", spine: "#7a1540", text: "#f5a8c4" },
    // Indigo
    { bg: "#0c0a1f", spine: "#2d1a7a", text: "#b8aaf5" },
    // Warm amber-brown
    { bg: "#1a1208", spine: "#6b4a10", text: "#f0d490" },
    // Dark cyan
    { bg: "#081818", spine: "#0d5c5c", text: "#90e0e0" },
  ];
  return palette[index % palette.length];
}
