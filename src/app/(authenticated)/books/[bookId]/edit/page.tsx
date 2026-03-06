import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/book/BookForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function EditBookPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = await params;
  const session = await auth();
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== session!.user.id) notFound();

  const initialData = {
    id:          book.id,
    title:       book.title,
    subtitle:    book.subtitle    ?? undefined,
    author:      book.author,
    narrator:    book.narrator    ?? undefined,
    description: book.description ?? undefined,
    genre:       book.genre       ?? undefined,
    language:    book.language,
    isbn:        book.isbn        ?? undefined,
    publisher:   book.publisher   ?? undefined,
    publishYear: book.publishYear ?? undefined,
  };

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <Link href={`/books/${book.id}`}
          className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors"
          style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          <ArrowLeft className="w-4 h-4" />
          Back to Book
        </Link>
        <h1 className="text-3xl font-display mb-2" style={{ color: "var(--text-primary)" }}>Edit Book</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
          Update your book&apos;s details and metadata.
        </p>
      </div>
      <BookForm mode="edit" initialData={initialData} />
    </div>
  );
}
