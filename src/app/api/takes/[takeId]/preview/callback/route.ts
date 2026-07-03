import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/takes/[takeId]/preview/callback
// Called by the whisper-worker when an A/B preview render finishes.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ takeId: string }> }
) {
  const { takeId } = await params;
  const body = await req.json();

  if (body.secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (body.status === "error") {
    console.error(`[preview/callback] Take ${takeId} preview failed:`, body.error);
    await prisma.take.update({ where: { id: takeId }, data: { previewStatus: "error" } }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  await prisma.take.update({ where: { id: takeId }, data: { previewStatus: "done" } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
