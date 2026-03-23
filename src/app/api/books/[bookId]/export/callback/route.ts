import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { uploadExportToDrive } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// POST /api/books/[bookId]/export/callback
// Called by the worker when M4B export is complete.
// Uploads the finished M4B to the book's Google Drive exports folder.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const body = await req.json();

  if (body.secret !== process.env.NEXTAUTH_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exportId, status, exportFileUrl, fileSizeBytes, error } = body;

  if (status === "error") {
    console.error(`[export/callback] Book ${bookId} export failed:`, error);
    await prisma.$transaction([
      prisma.export.update({
        where: { id: exportId },
        data: { exportStatus: "error" },
      }),
      prisma.book.update({
        where: { id: bookId },
        data: { exportStatus: "idle" },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  // Upload M4B to Google Drive
  let driveFileId: string | null = null;
  try {
    const book = await prisma.book.findUnique({ where: { id: bookId }, select: { userId: true } });
    if (book) {
      const fileName = path.basename(exportFileUrl); // e.g. MyBook_v2026-03-23-1430.m4b
      // exportFileUrl is e.g. /exports/MyBook_v....m4b — resolve to local filesystem path
      const localPath = path.join(process.cwd(), "public", exportFileUrl);
      const buffer = await readFile(localPath);
      const { fileId } = await uploadExportToDrive(book.userId, bookId, fileName, buffer);
      driveFileId = fileId;
      console.log(`[export/callback] Uploaded M4B to Drive: ${fileId}`);
    }
  } catch (err) {
    // Drive upload failure is non-fatal — export still succeeds locally
    console.error("[export/callback] Drive upload failed (non-fatal):", err);
  }

  await prisma.$transaction([
    prisma.export.update({
      where: { id: exportId },
      data: {
        exportStatus: "done",
        exportFileUrl,
        driveFileId,
        fileSizeBytes: fileSizeBytes ?? null,
        exportedAt: new Date(),
      },
    }),
    prisma.book.update({
      where: { id: bookId },
      data: {
        exportStatus: "idle",
        exportDriveId: driveFileId ?? undefined,
        version: { increment: 1 },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
