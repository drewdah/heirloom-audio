import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bookUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  subtitle: z.string().max(500).optional(),
  author: z.string().min(1).max(500).optional(),
  narrator: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  genre: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  isbn: z.string().max(20).optional(),
  publisher: z.string().max(200).optional(),
  publishYear: z.number().int().min(1800).max(2100).optional(),
  status: z.enum(["IN_PROGRESS", "COMPLETE", "ARCHIVED"]).optional(),
});

async function getAuthorizedBook(bookId: string, userId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== userId) return null;
  return book;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: { chapters: { orderBy: { order: "asc" } }, exports: { orderBy: { exportedAt: "desc" } } },
  });

  if (!book || book.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(book);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await getAuthorizedBook(bookId, session.user.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = bookUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const updated = await prisma.book.update({
    where: { id: bookId },
    data: parsed.data,
  });

  // Rename Drive folder if title changed — fire-and-forget, non-fatal
  if (parsed.data.title && parsed.data.title !== book.title) {
    import("@/lib/google-drive").then(({ renameBookFolder }) =>
      renameBookFolder(session.user!.id, bookId, parsed.data.title!).catch((err) =>
        console.warn("[book update] Drive folder rename failed (non-fatal):", err)
      )
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await getAuthorizedBook(bookId, session.user.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optional: delete the book's Drive folder
  const { searchParams } = new URL(req.url);
  const deleteDrive = searchParams.get("deleteDrive") === "true";

  if (deleteDrive && book.driveFolderId) {
    try {
      const { getDriveClient } = await import("@/lib/google-drive");
      const drive = await getDriveClient(session.user.id);
      // Delete only the book's own folder — leaves HeirloomAudio root untouched
      await drive.files.delete({ fileId: book.driveFolderId });
    } catch (err) {
      // Log but don't block — DB cleanup should always succeed
      console.warn("[book delete] Drive folder deletion failed:", err);
    }
  }

  // Delete local cover file if present
  try {
    const { unlink } = await import("fs/promises");
    const { join } = await import("path");
    const { existsSync } = await import("fs");
    const coversDir = join(process.cwd(), "public", "covers");
    for (const ext of ["jpg", "png", "webp"]) {
      const p = join(coversDir, `${bookId}.${ext}`);
      if (existsSync(p)) await unlink(p).catch(() => {});
    }
  } catch {}

  // Cascade delete handles chapters and exports via Prisma schema
  await prisma.book.delete({ where: { id: bookId } });
  return NextResponse.json({ ok: true });
}
