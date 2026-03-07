import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDriveClient } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const { takeId } = await params;
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });

  if (!take || take.chapter.book.userId !== session.user.id)
    return new NextResponse("Not found", { status: 404 });

  if (!take.audioDriveId)
    return new NextResponse("No audio", { status: 404 });

  try {
    const drive = await getDriveClient(session.user.id);
    const rangeHeader = req.headers.get("range");

    const driveRes = await drive.files.get(
      { fileId: take.audioDriveId, alt: "media" },
      {
        responseType: "stream",
        headers: rangeHeader ? { Range: rangeHeader } : {},
      }
    );

    const stream = driveRes.data as NodeJS.ReadableStream;
    const status = (driveRes.status as number) ?? 200;
    const contentType = (driveRes.headers as any)["content-type"] ?? "audio/webm";
    const contentLength = (driveRes.headers as any)["content-length"];
    const contentRange = (driveRes.headers as any)["content-range"];

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "Cross-Origin-Resource-Policy": "same-origin",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    const { Readable } = await import("stream");
    const webStream = Readable.toWeb(stream as any) as ReadableStream;

    return new NextResponse(webStream, { status, headers });
  } catch (err) {
    console.error("[takes/stream] Drive error:", err);
    return new NextResponse("Failed to stream audio", { status: 502 });
  }
}
