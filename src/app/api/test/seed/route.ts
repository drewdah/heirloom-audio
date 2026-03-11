import { NextResponse } from "next/server";

function isTestEnv() {
  return process.env.NODE_ENV === "test";
}

export async function POST() {
  if (!isTestEnv()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.upsert({
    where: { email: "test@heirloom.local" },
    update: {},
    create: {
      email: "test@heirloom.local",
      name: "Test User",
      googleId: "test-google-id",
    },
  });

  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.session.upsert({
    where: { sessionToken: "test-session-token" },
    update: { expires },
    create: {
      sessionToken: "test-session-token",
      userId: user.id,
      expires,
    },
  });

  return NextResponse.json({ userId: user.id, ok: true });
}

export async function DELETE() {
  if (!isTestEnv()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { prisma } = await import("@/lib/prisma");

  await prisma.take.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.export.deleteMany();
  await prisma.book.deleteMany();

  return NextResponse.json({ ok: true });
}
