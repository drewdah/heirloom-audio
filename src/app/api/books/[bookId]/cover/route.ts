import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadCoverToDrive } from "@/lib/google-drive";

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

  const { fileId, webContentLink } = await uploadCoverToDrive(
    session.user.id,
    bookId,
    buffer,
    file.type
  );

  const updated = await prisma.book.update({
    where: { id: bookId },
    data: { coverDriveId: fileId, coverImageUrl: webContentLink },
  });

  return NextResponse.json({ coverImageUrl: updated.coverImageUrl });
}
