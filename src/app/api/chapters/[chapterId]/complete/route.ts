import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";

// PATCH /api/chapters/[chapterId]/complete — toggle recordingComplete
// When marking complete: triggers audio processing pipeline
// When unmarking: resets processing state so chapter can be re-recorded
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: true,
      takes: { where: { isActive: true }, orderBy: { regionStart: "asc" } },
    },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newValue = typeof body.complete === "boolean" ? body.complete : !chapter.recordingComplete;

  if (newValue) {
    // ── Marking complete → kick off processing ───────────────────────────
    const takesForWorker = chapter.takes
      .filter((t) => t.audioFileUrl)
      .map((t) => ({
        takeId: t.id,
        filePath: `/app/public/takes/${t.audioFileUrl!.replace("/takes/", "")}`,
        regionStart: t.regionStart ?? 0,
        regionEnd: t.regionEnd ?? (t.regionStart ?? 0) + (t.durationSeconds ?? 0),
        fileOffset: t.fileOffset ?? 0,
        durationSeconds: t.durationSeconds ?? 0,
      }));

    // Mark chapter complete + processing simultaneously
    const updated = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        recordingComplete: true,
        processStatus: takesForWorker.length > 0 ? "processing" : "idle",
      },
    });

    if (takesForWorker.length > 0) {
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
        console.error("[complete] Redis push failed (non-fatal):", err);
        // Don't fail the request — chapter is still marked complete
        await prisma.chapter.update({
          where: { id: chapterId },
          data: { processStatus: "error" },
        });
      }
    }

    return NextResponse.json({ chapter: updated });
  } else {
    // ── Unmarking complete → reset processing state ───────────────────────
    const updated = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        recordingComplete: false,
        processStatus: "idle",
        processedAt: null,
      },
    });

    // Clear processedFileUrl on all takes so they'll be re-processed next time
    await prisma.take.updateMany({
      where: { chapterId },
      data: { processedFileUrl: null },
    });

    return NextResponse.json({ chapter: updated });
  }
}
