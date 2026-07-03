import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureLocalOriginal } from "@/lib/take-restore";
import { createClient } from "redis";

export const dynamic = "force-dynamic";

const PREVIEW_SECONDS = 12;

function stemOf(audioFileUrl: string): string {
  return audioFileUrl.split("/").pop()!.replace(/\.[^.]+$/, "");
}

// POST /api/takes/[takeId]/preview — render a short raw-vs-processed A/B preview
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { takeId } = await params;
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });
  if (!take || take.chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!take.audioFileUrl)
    return NextResponse.json({ error: "No audio to preview" }, { status: 400 });

  // Make sure the original is present locally (restore from Drive if the local copy was lost).
  const { available } = await ensureLocalOriginal(take, session.user.id);
  if (!available)
    return NextResponse.json({ error: "original_unavailable" }, { status: 409 });

  await prisma.take.update({ where: { id: takeId }, data: { previewStatus: "processing" } });

  const basename = take.audioFileUrl.split("/").pop()!;
  const job = {
    type: "preview_take",
    takeId,
    filePath: `/app/public/takes/${basename}`,
    fileOffset: take.fileOffset,
    previewSeconds: PREVIEW_SECONDS,
    secret: process.env.NEXTAUTH_SECRET ?? "",
  };

  try {
    const redis = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
    await redis.connect();
    await redis.rPush("heirloom:transcription:queue", JSON.stringify(job));
    await redis.quit();
  } catch (err) {
    console.error("[preview] Redis push failed:", err);
    await prisma.take.update({ where: { id: takeId }, data: { previewStatus: "idle" } });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  return NextResponse.json({ status: "processing" });
}

// GET /api/takes/[takeId]/preview — poll preview status + snippet URLs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { takeId } = await params;
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: { select: { userId: true } } } } },
  });
  if (!take || take.chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stem = take.audioFileUrl ? stemOf(take.audioFileUrl) : null;
  return NextResponse.json({
    previewStatus: take.previewStatus,
    rawUrl: stem ? `/takes/${stem}_preview_raw.wav` : null,
    processedUrl: stem ? `/takes/${stem}_preview.wav` : null,
  });
}
