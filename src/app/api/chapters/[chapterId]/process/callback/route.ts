import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadProcessedTakeToDrive } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// POST /api/chapters/[chapterId]/process/callback
// Called by the whisper-worker when FFmpeg processing is complete.
// Uploads processed take WAVs to Google Drive.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const body = await req.json();

  if (body.secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.status === "error") {
    console.error(`[process/callback] Chapter ${chapterId} processing failed:`, body.error);
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { processStatus: "error" },
    });
    return NextResponse.json({ ok: true });
  }

  // body.takes = [{ takeId, processedFileUrl }]
  const processedTakes: { takeId: string; processedFileUrl: string }[] = body.takes ?? [];

  // Save processed URLs to DB first so the chapter is unblocked immediately
  await prisma.$transaction([
    ...processedTakes.map((t) =>
      prisma.take.update({
        where: { id: t.takeId },
        data: { processedFileUrl: t.processedFileUrl },
      })
    ),
    prisma.chapter.update({
      where: { id: chapterId },
      data: { processStatus: "done", processedAt: new Date() },
    }),
  ]);

  // Upload processed WAVs to Drive in the background (non-fatal if Drive is unavailable)
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { bookId: true, book: { select: { userId: true } } },
  });
  if (chapter) {
    const { bookId, book: { userId } } = chapter;
    for (const t of processedTakes) {
      try {
        const fileName = path.basename(t.processedFileUrl); // e.g. xxx_processed.wav
        const localPath = path.join(process.cwd(), "public", "takes", fileName);
        const buffer = await readFile(localPath);
        await uploadProcessedTakeToDrive(userId, bookId, fileName, buffer);
      } catch (err) {
        console.error(`[process/callback] Drive upload failed for take ${t.takeId} (non-fatal):`, err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
