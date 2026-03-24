import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateVersionTag } from "@/lib/utils";
import { z } from "zod";

const bookSchema = z.object({
  title: z.string().min(1).max(500),
  subtitle: z.string().max(500).optional(),
  author: z.string().min(1).max(500),
  narrator: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  genre: z.string().max(100).optional(),
  language: z.string().max(10).default("en"),
  isbn: z.string().max(20).optional(),
  publisher: z.string().max(200).optional(),
  publishYear: z.number().int().min(1800).max(2100).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const books = await prisma.book.findMany({
    where: { userId: session.user.id },
    include: { chapters: true, _count: { select: { chapters: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(books);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the user actually exists in the DB — JWT can outlive a DB reset
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json(
      { error: "Session is stale. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }

  const book = await prisma.book.create({
    data: {
      ...parsed.data,
      userId: session.user.id,
      versionTag: generateVersionTag(1),
    },
  });

  // Eagerly create the Drive folder structure — fire-and-forget, non-fatal
  import("@/lib/google-drive").then(({ ensureBookFolder }) =>
    ensureBookFolder(session.user.id, book.id).catch((err) =>
      console.warn("[book create] Drive folder creation failed (non-fatal):", err)
    )
  );

  return NextResponse.json(book, { status: 201 });
}
