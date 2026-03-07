import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReadStream, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

// GET /api/books/[bookId]/export/download?exportId=xxx
// Streams the M4B file to the browser as a download.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { bookId } = await params;
  const exportId = req.nextUrl.searchParams.get("exportId");

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { userId: true, title: true },
  });

  if (!book || book.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find the export record
  const exportRecord = exportId
    ? await prisma.export.findUnique({ where: { id: exportId } })
    : await prisma.export.findFirst({
        where: { bookId, exportStatus: "done" },
        orderBy: { exportedAt: "desc" },
      });

  if (!exportRecord?.exportFileUrl)
    return NextResponse.json({ error: "Export file not found" }, { status: 404 });

  // Resolve to absolute path — exportFileUrl is like /exports/BookTitle_v2024-03-07-1423.m4b
  const filePath = join(process.cwd(), "public", exportRecord.exportFileUrl.replace(/^\//, ""));

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const filename = `${book.title.replace(/[^a-z0-9]/gi, "_")}_${exportRecord.versionTag}.m4b`;
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": "audio/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(stat.size),
    },
  });
}
