import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/books/[bookId]/export/callback
// Called by the worker when M4B export is complete.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;
  const body = await req.json();

  if (body.secret !== process.env.NEXTAUTH_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { exportId, status, exportFileUrl, driveFileId, fileSizeBytes, error } = body;

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

  await prisma.$transaction([
    prisma.export.update({
      where: { id: exportId },
      data: {
        exportStatus: "done",
        exportFileUrl,
        driveFileId: driveFileId ?? null,
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
