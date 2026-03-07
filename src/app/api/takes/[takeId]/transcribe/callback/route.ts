import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/takes/[takeId]/transcribe/callback
// Called by the whisper-worker container when transcription is complete.
// Verified by NEXTAUTH_SECRET so it can't be called externally.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const { takeId } = await params;
  const body = await req.json();

  // Verify the shared secret
  const expectedSecret = process.env.NEXTAUTH_SECRET ?? "";
  if (!expectedSecret || body.secret !== expectedSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status: string = body.status; // "done" | "error"

  if (status === "done" && typeof body.transcription === "string") {
    await prisma.take.update({
      where: { id: takeId },
      data: {
        transcript: body.transcription,
        transcriptStatus: "done",
      },
    });
  } else {
    console.error(`[transcribe/callback] Worker reported error for take ${takeId}:`, body.error);
    await prisma.take.update({
      where: { id: takeId },
      data: { transcriptStatus: "error" },
    });
  }

  return NextResponse.json({ ok: true });
}
