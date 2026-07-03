import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeAudioSettings } from "@/lib/audio-settings";

export const dynamic = "force-dynamic";

const COMPRESSION = ["gentle", "recommended", "strong"];

// GET /api/user/audio-settings — the current user's audio processing preferences
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { audioCompression: true, audioDenoise: true },
  });
  return NextResponse.json(normalizeAudioSettings(user ?? {}));
}

// PUT /api/user/audio-settings — update from the Mic Check wizard
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: { audioCompression?: string; audioDenoise?: boolean } = {};

  if (typeof body.compression === "string") {
    if (!COMPRESSION.includes(body.compression))
      return NextResponse.json({ error: "invalid_compression" }, { status: 400 });
    data.audioCompression = body.compression;
  }
  if (typeof body.denoise === "boolean") data.audioDenoise = body.denoise;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "no_fields" }, { status: 400 });

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { audioCompression: true, audioDenoise: true },
  });
  return NextResponse.json(normalizeAudioSettings(user));
}
