import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/chapters/[chapterId]/process/callback
// Called by the whisper-worker when FFmpeg processing is complete.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;
  const body = await req.json();

  // Verify shared secret
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

  await prisma.$transaction([
    // Update each take with its processed file URL
    ...processedTakes.map((t) =>
      prisma.take.update({
        where: { id: t.takeId },
        data: { processedFileUrl: t.processedFileUrl },
      })
    ),
    // Mark chapter as done
    prisma.chapter.update({
      where: { id: chapterId },
      data: {
        processStatus: "done",
        processedAt: new Date(),
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
