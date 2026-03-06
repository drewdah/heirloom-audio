import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Bookshelf from "@/components/bookshelf/Bookshelf";
import EmptyShelf from "@/components/bookshelf/EmptyShelf";
import Link from "next/link";
import { PlusCircle } from "lucide-react";

export default async function ShelfPage() {
  const session = await auth();
  const userId = session!.user.id;

  const books = await prisma.book.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    include: { chapters: true },
    orderBy: { updatedAt: "desc" },
  });

  const firstName = session!.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="page-enter">
      {/* Clean dark header — no brown */}
      <div
        className="border-b"
        style={{
          background: "var(--bg-base)",
          borderColor: "var(--border-subtle)",
        }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest mb-1"
                style={{ color: "var(--text-tertiary)", letterSpacing: "0.2em", fontFamily: "var(--font-sans)", fontWeight: 500 }}>
                Welcome back, {firstName}
              </p>
              <h1 className="text-3xl font-display" style={{ color: "var(--text-primary)" }}>
                Your Library
              </h1>
            </div>
            {books.length > 0 && (
              <div className="flex items-center gap-4">
                <p className="text-sm" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}>
                  {books.length} {books.length === 1 ? "book" : "books"}
                </p>
                <Link href="/books/new" className="ha-btn-primary" style={{ padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
                  <PlusCircle className="w-3.5 h-3.5" />
                  New Book
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bookshelf area — dark page background, wood only on shelves */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {books.length === 0 ? (
          <EmptyShelf />
        ) : (
          <Bookshelf books={books} />
        )}
      </div>
    </div>
  );
}
