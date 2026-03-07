import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAudioToDrive } from "@/lib/google-drive";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/chapters/[chapterId]/takes — list all takes for a chapter
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true, takes: { orderBy: { createdAt: "asc" } } },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ takes: chapter.takes });
}

// POST /api/chapters/[chapterId]/takes — upload a new take
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chapterId } = await params;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true, takes: true },
  });
  if (!chapter || chapter.book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });

  const baseType = file.type.split(";")[0].trim().toLowerCase();
  const extMap: Record<string, string> = {
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  };
  const ext = extMap[baseType] ?? "webm";

  const regionStart = formData.get("regionStart") ? parseFloat(formData.get("regionStart") as string) : null;
  const regionEnd = formData.get("regionEnd") ? parseFloat(formData.get("regionEnd") as string) : null;
  const durationSeconds = formData.get("duration") ? parseFloat(formData.get("duration") as string) : null;

  const takeNumber = chapter.takes.length + 1;
  const regionLabel = regionStart != null && regionEnd != null
    ? ` — ${formatSecs(regionStart)}–${formatSecs(regionEnd)}`
    : "";
  const label = `Take ${takeNumber}${regionLabel}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Step 1: Save locally for immediate playback ──────────────────────────
  // Create a placeholder take to get its ID for the filename
  const tempTake = await prisma.take.create({
    data: {
      chapterId,
      label,
      audioFileUrl: null,
      audioDriveId: null,
      audioFileName: null,
      fileSizeBytes: file.size,
      durationSeconds,
      regionStart,
      regionEnd,
      isActive: true,
    },
  });

  const localFileName = `${tempTake.id}.${ext}`;
  const localDir = join(process.cwd(), "public", "takes");
  const localPath = join(localDir, localFileName);
  const localUrl = `/takes/${localFileName}`;

  try {
    await mkdir(localDir, { recursive: true });
    await writeFile(localPath, buffer);
  } catch (err) {
    console.error("[takes] Local save failed:", err);
  }

  // Update DB with local URL immediately so UI can render waveform
  const take = await prisma.take.update({
    where: { id: tempTake.id },
    data: {
      audioFileUrl: localUrl,
      audioFileName: localFileName,
    },
  });

  // ── Step 2: Upload to Drive in background ────────────────────────────────
  const orderStr = String(chapter.order).padStart(2, "0");
  const slug = chapter.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
  const driveName = `${orderStr}-${slug}-take${takeNumber}.${ext}`;

  // Fire and forget — update DB when done
  uploadAudioToDrive(session.user.id, chapter.bookId, driveName, buffer, baseType)
    .then(async ({ fileId }) => {
      await prisma.take.update({
        where: { id: take.id },
        data: {
          audioDriveId: fileId,
          audioFileName: driveName,
          // Keep local URL for fast serving — switch to stream URL once Drive is done
          audioFileUrl: localUrl,
        },
      });
    })
    .catch((err) => {
      console.error("[takes] Drive upload failed (non-fatal):", err);
    });

  return NextResponse.json({ take });
}

function formatSecs(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
