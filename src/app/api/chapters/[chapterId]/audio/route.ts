import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAudioToDrive, deleteDriveFile } from "@/lib/google-drive";

// App Router segment config — increase body size limit for audio uploads
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chapterId } = await params;
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { book: true },
    });
    if (!chapter || chapter.book.userId !== session.user.id)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("audio") as File | null;
    if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });

    // Strip codec suffix (e.g. "audio/webm;codecs=opus" → "audio/webm")
    const baseType = file.type.split(";")[0].trim().toLowerCase();
    const allowed = ["audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac"];
    if (!allowed.includes(baseType))
      return NextResponse.json({ error: `Unsupported format: ${baseType}` }, { status: 400 });

    if (file.size > 500 * 1024 * 1024)
      return NextResponse.json({ error: "File too large (max 500MB)" }, { status: 400 });

    console.log(`[audio] Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB, type: ${baseType})`);

    const buffer = Buffer.from(await file.arrayBuffer());

    if (chapter.audioDriveId) {
      await deleteDriveFile(session.user.id, chapter.audioDriveId).catch(() => {});
    }

    const orderStr = String(chapter.order).padStart(2, "0");
    const slug = chapter.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40);
    const extMap: Record<string, string> = {
      "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
      "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
    };
    const ext = extMap[baseType] ?? "webm";
    const fileName = `${orderStr}-${slug}.${ext}`;

    let uploadResult: { fileId: string; webViewLink: string };
    try {
      uploadResult = await uploadAudioToDrive(
        session.user.id,
        chapter.bookId,
        fileName,
        buffer,
        baseType
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Drive upload failed";
      console.error("[audio] Drive upload error:", err);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const { fileId, webViewLink } = uploadResult;
    const durationStr = formData.get("duration") as string | null;
    const durationSeconds = durationStr ? parseFloat(durationStr) : null;

    const updated = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        audioDriveId: fileId,
        audioFileUrl: `/api/chapters/${chapterId}/stream`,
        audioFileName: fileName,
        audioFileSizeBytes: file.size,
        durationSeconds,
        recordedAt: new Date(),
        transcriptionStatus: "PENDING",
      },
    });

    console.log(`[audio] ✓ Uploaded to Drive: ${fileId}`);
    return NextResponse.json({ chapter: updated, driveUrl: webViewLink });

  } catch (err) {
    console.error("[audio] Unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (chapter.audioDriveId) {
    await deleteDriveFile(session.user.id, chapter.audioDriveId).catch(() => {});
  }

  const updated = await prisma.chapter.update({
    where: { id: chapterId },
    data: { audioDriveId: null, audioFileUrl: null, durationSeconds: null, recordedAt: null, transcriptionStatus: "PENDING" },
  });

  return NextResponse.json({ chapter: updated });
}
