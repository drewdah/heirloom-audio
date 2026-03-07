import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";
import { join } from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

const QUEUE_KEY = "heirloom:transcription:queue";

async function getRedis() {
  const client = createClient({ url: process.env.REDIS_URL ?? "redis://localhost:6379" });
  await client.connect();
  return client;
}

// POST /api/takes/[takeId]/transcribe
// Pushes a transcription job onto the Redis queue for the whisper-worker.
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

  if (!take.audioFileUrl?.startsWith("/takes/")) {
    return NextResponse.json({ error: "No local audio file available" }, { status: 422 });
  }

  const localPath = join(process.cwd(), "public", take.audioFileUrl);
  if (!existsSync(localPath)) {
    return NextResponse.json({ error: "Audio file not on disk" }, { status: 422 });
  }

  await prisma.take.update({
    where: { id: takeId },
    data: { transcriptStatus: "processing" },
  });

  // Send a container-relative path that maps to the mounted volume
  // The worker has /app/public/takes mounted from ./public/takes
  const containerPath = `/app/public/takes/${take.audioFileUrl.replace("/takes/", "")}`;

  const job = {
    takeId,
    filePath: containerPath,
    language: take.chapter.book.language ?? "en",
    secret: process.env.NEXTAUTH_SECRET ?? "",
  };

  try {
    const redis = await getRedis();
    await redis.rPush(QUEUE_KEY, JSON.stringify(job));
    await redis.quit();
  } catch (err) {
    console.error("[transcribe] Redis push failed:", err);
    await prisma.take.update({
      where: { id: takeId },
      data: { transcriptStatus: "error" },
    });
    return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  }

  return NextResponse.json({ status: "processing" }, { status: 202 });
}
