import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";

export const dynamic = "force-dynamic";

// POST /api/chapters/[chapterId]/process
// Pushes a chapter processing job onto the Redis queue.
// The worker will run the FFmpeg filter chain on all active takes
// and save processed copies alongside the originals.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: true,
      takes: {
        where: { isActive: true },
        orderBy: { regionStart: "asc" },
      },
    },
  });

  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (chapter.takes.length === 0)
    return NextResponse.json({ error: "No active takes to process" }, { status: 400 });

  // Build take list for the worker — only takes with a local file
  const takesForWorker = chapter.takes
    .filter((t) => t.audioFileUrl)
    .map((t) => ({
      takeId: t.id,
      filePath: `/app/public/takes/${t.audioFileUrl!.split("/").pop()}`,
      regionStart: t.regionStart ?? 0,
      regionEnd: t.regionEnd ?? (t.regionStart ?? 0) + (t.durationSeconds ?? 0),
      fileOffset: t.fileOffset ?? 0,
      durationSeconds: t.durationSeconds ?? 0,
    }));

  if (takesForWorker.length === 0)
    return NextResponse.json({ error: "No takes with audio files ready" }, { status: 400 });

  // Mark chapter as processing
  await prisma.chapter.update({
    where: { id: chapterId },
    data: { processStatus: "processing" },
  });

  const job = {
    type: "process_chapter",
    chapterId,
    takes: takesForWorker,
    secret: process.env.NEXTAUTH_SECRET ?? "",
  };

  try {
    const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    await redis.connect();
    await redis.rPush("heirloom:transcription:queue", JSON.stringify(job));
    await redis.quit();
  } catch (err) {
    console.error("[process] Redis push failed:", err);
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { processStatus: "idle" },
    });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  return NextResponse.json({ status: "processing" });
}

// GET /api/chapters/[chapterId]/process — poll processing status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      processStatus: true,
      processedAt: true,
      takes: {
        where: { isActive: true },
        select: { id: true, processedFileUrl: true },
      },
    },
  });

  if (!chapter)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ chapter });
}
