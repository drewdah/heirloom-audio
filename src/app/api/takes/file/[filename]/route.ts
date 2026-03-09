import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = join(process.cwd(), "public", "takes", filename);
  if (!existsSync(filePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await readFile(filePath);
  const ext = filename.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "wav" ? "audio/wav" :
    ext === "mp3" ? "audio/mpeg" :
    ext === "ogg" ? "audio/ogg" :
    "audio/webm";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}
