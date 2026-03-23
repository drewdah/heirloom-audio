import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";

export const dynamic = "force-dynamic";

// POST /api/books/[bookId]/export
// Validates all chapters are complete, creates an Export record, queues the job.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      chapters: {
        orderBy: { order: "asc" },
        include: {
          takes: { where: { isActive: true }, orderBy: { regionStart: "asc" } },
        },
      },
      _count: { select: { exports: true } },
    },
  });

  if (!book || book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check all chapters are complete
  const incompleteChapters = book.chapters.filter((c) => !c.recordingComplete);
  if (incompleteChapters.length > 0) {
    return NextResponse.json(
      {
        error: "incomplete_chapters",
        chapters: incompleteChapters.map((c) => ({ id: c.id, title: c.title, order: c.order })),
      },
      { status: 422 }
    );
  }

  // Check all chapters have processed audio
  const unprocessedChapters = book.chapters.filter((c) => c.processStatus !== "done");
  if (unprocessedChapters.length > 0) {
    return NextResponse.json(
      {
        error: "unprocessed_chapters",
        chapters: unprocessedChapters.map((c) => ({ id: c.id, title: c.title, order: c.order, processStatus: c.processStatus })),
      },
      { status: 422 }
    );
  }

  // Build version tag from export datetime: v2024-03-07-1423
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const versionTag = `v${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const version = (book._count?.exports ?? 0) + 1;

  // Create Export record
  const exportRecord = await prisma.export.create({
    data: {
      bookId,
      version,
      versionTag,
      exportStatus: "pending",
    },
  });

  // Mark book as exporting
  await prisma.book.update({
    where: { id: bookId },
    data: { exportStatus: "exporting" },
  });

  // Build chapter list for worker
  const chaptersForWorker = book.chapters.map((c) => {
    const activeTakes = c.takes.filter((t) => t.isActive);
    return {
      chapterId: c.id,
      title: c.title,
      order: c.order,
      takes: activeTakes.map((t) => ({
        takeId: t.id,
        // Prefer processed file, fall back to raw.
        // Use basename only — stored URLs may have /takes/ or /api/takes/ prefix depending on version.
        filePath: t.processedFileUrl
          ? `/app/public/takes/${t.processedFileUrl.split("/").pop()}`
          : `/app/public/takes/${t.audioFileUrl!.split("/").pop()}`,
        regionStart: t.regionStart ?? 0,
        regionEnd: t.regionEnd ?? (t.regionStart ?? 0) + (t.durationSeconds ?? 0),
        fileOffset: t.fileOffset ?? 0,
        durationSeconds: t.durationSeconds ?? 0,
        isProcessed: !!t.processedFileUrl,
      })),
    };
  });

  const job = {
    type: "export_book",
    exportId: exportRecord.id,
    bookId,
    versionTag,
    metadata: {
      title: book.title,
      subtitle: book.subtitle ?? "",
      author: book.author,
      narrator: book.narrator ?? book.author,
      description: book.description ?? "",
      genre: book.genre ?? "",
      language: book.language,
      publisher: book.publisher ?? "",
      year: book.publishYear ? String(book.publishYear) : String(now.getFullYear()),
      coverImageUrl: book.coverImageUrl ?? null,
    },
    chapters: chaptersForWorker,
    secret: process.env.NEXTAUTH_SECRET ?? "",
  };

  try {
    const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    await redis.connect();
    await redis.rPush("heirloom:transcription:queue", JSON.stringify(job));
    await redis.quit();
  } catch (err) {
    console.error("[export] Redis push failed:", err);
    await prisma.export.update({ where: { id: exportRecord.id }, data: { exportStatus: "error" } });
    await prisma.book.update({ where: { id: bookId }, data: { exportStatus: "idle" } });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  return NextResponse.json({ exportId: exportRecord.id, versionTag, status: "pending" });
}

// GET /api/books/[bookId]/export — poll latest export status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      exportStatus: true,
      exports: {
        orderBy: { exportedAt: "desc" },
        take: 1,
        select: {
          id: true,
          version: true,
          versionTag: true,
          exportStatus: true,
          exportFileUrl: true,
          exportedAt: true,
          fileSizeBytes: true,
        },
      },
    },
  });

  if (!book)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ exportStatus: book.exportStatus, latestExport: book.exports[0] ?? null });
}
