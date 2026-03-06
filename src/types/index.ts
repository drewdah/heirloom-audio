import type { Book, Chapter, User, Export } from "@prisma/client";

export type BookWithChapters = Book & {
  chapters: Chapter[];
  _count?: { chapters: number };
};

export type BookWithStats = Book & {
  chapters: Chapter[];
  totalDuration: number;
  recordedCount: number;
};

export type ChapterWithBook = Chapter & {
  book: Book;
};

export type ExportWithBook = Export & {
  book: Book;
};

export type UserWithBooks = User & {
  books: BookWithChapters[];
};

export interface BookFormData {
  title: string;
  subtitle?: string;
  author: string;
  narrator?: string;
  description?: string;
  genre?: string;
  language: string;
  isbn?: string;
  publisher?: string;
  publishYear?: number;
}

export interface AudiobookGenre {
  value: string;
  label: string;
}

export const AUDIOBOOK_GENRES: AudiobookGenre[] = [
  { value: "Religion & Spirituality", label: "Religion & Spirituality" },
  { value: "Bibles", label: "Bibles" },
  { value: "Christian Books & Bibles", label: "Christian Books & Bibles" },
  { value: "Biography & Memoir", label: "Biography & Memoir" },
  { value: "History", label: "History" },
  { value: "Fiction", label: "Fiction" },
  { value: "Self-Help", label: "Self-Help" },
  { value: "Family & Relationships", label: "Family & Relationships" },
  { value: "Children's Audiobooks", label: "Children's Audiobooks" },
  { value: "Poetry", label: "Poetry" },
  { value: "Other", label: "Other" },
];

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
];

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
