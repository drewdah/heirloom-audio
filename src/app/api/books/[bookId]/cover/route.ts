import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadCoverToDrive } from "@/lib/google-drive";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { extractSpineColor } from "@/lib/color-extract";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("cover") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type))
    return NextResponse.json({ error: "Must be JPEG, PNG, or WebP" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "Max 10MB" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

  // Save locally to /public/covers/{bookId}.{ext} for direct serving
  const coversDir = join(process.cwd(), "public", "covers");
  await mkdir(coversDir, { recursive: true });

  // Delete old local cover if it exists (any extension)
  for (const oldExt of ["jpg", "png", "webp"]) {
    const oldPath = join(coversDir, `${bookId}.${oldExt}`);
    if (existsSync(oldPath)) await unlink(oldPath).catch(() => {});
  }

  const localPath = join(coversDir, `${bookId}.${ext}`);
  await writeFile(localPath, buffer);
  const localUrl = `/covers/${bookId}.${ext}`;

  // Extract dominant spine color from the image
  const extractedColor = await extractSpineColor(buffer);

  // Also upload to Drive in the background (for backup/export use)
  let driveFileId: string | undefined;
  try {
    const driveResult = await uploadCoverToDrive(session.user.id, bookId, buffer, file.type);
    driveFileId = driveResult.fileId;
  } catch {
    // Drive upload failing shouldn't block the cover from showing
    console.warn("[cover] Drive upload failed, serving local copy only");
  }

  const updated = await prisma.book.update({
    where: { id: bookId },
    data: {
      coverImageUrl: localUrl,
      ...(driveFileId ? { coverDriveId: driveFileId } : {}),
      ...(extractedColor ? { spineColor: JSON.stringify(extractedColor) } : {}),
    },
  });

  return NextResponse.json({ coverImageUrl: updated.coverImageUrl, spineColor: updated.spineColor });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete local file
  const coversDir = join(process.cwd(), "public", "covers");
  for (const ext of ["jpg", "png", "webp"]) {
    const p = join(coversDir, `${bookId}.${ext}`);
    if (existsSync(p)) await unlink(p).catch(() => {});
  }

  // Delete from Drive if present
  if (book.coverDriveId) {
    try {
      const { getDriveClient } = await import("@/lib/google-drive");
      const drive = await getDriveClient(session.user.id);
      await drive.files.delete({ fileId: book.coverDriveId }).catch(() => {});
    } catch {}
  }

  await prisma.book.update({
    where: { id: bookId },
    data: { coverImageUrl: null, coverDriveId: null, spineColor: null },
  });

  return NextResponse.json({ ok: true });
}
