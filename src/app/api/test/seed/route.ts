import { NextRequest, NextResponse } from "next/server";

/**
 * Test-only seed endpoint for E2E tests.
 *
 * POST /api/test/seed — seeds the test user + session.
 *   Optional JSON body to also seed content:
 *     { book: true }                    → creates a test book
 *     { book: true, chapters: 3 }       → creates a book with 3 chapters
 *     { book: true, chapters: 1, take: true } → book + chapter + take
 *
 * DELETE /api/test/seed — clears all content data.
 *
 * Guarded by the ENABLE_TEST_SEED environment variable.
 * We use a custom env var instead of NODE_ENV because Next.js inlines
 * NODE_ENV at build time — setting it at runtime has no effect.
 */

export const dynamic = "force-dynamic";

function isTestSeedEnabled() {
  return process.env.ENABLE_TEST_SEED === "true";
}

export async function POST(req: NextRequest) {
  if (!isTestSeedEnabled()) {
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

  let bookId: string | null = null;
  const chapterIds: string[] = [];

  try {
    const body = await req.json().catch(() => ({}));

    if (body.book) {
      const book = await prisma.book.create({
        data: {
          userId: user.id,
          title: body.bookTitle ?? "Test Book",
          author: body.bookAuthor ?? "Test Author",
          language: "en",
          versionTag: "v1-test",
        },
      });
      bookId = book.id;

      const numChapters = body.chapters ?? 0;
      for (let i = 1; i <= numChapters; i++) {
        const ch = await prisma.chapter.create({
          data: {
            bookId: book.id,
            order: i,
            title: `Chapter ${i}`,
            groupTitle: body.groupTitle ?? null,
          },
        });
        chapterIds.push(ch.id);

        if (body.take) {
          await prisma.take.create({
            data: {
              chapterId: ch.id,
              label: `Take 1`,
              audioFileUrl: `/takes/test-take-ch${i}.webm`,
              durationSeconds: 10,
              regionStart: 0,
              regionEnd: 10,
              isActive: true,
            },
          });
        }
      }
    }
  } catch {
    // Body parsing failed — just seed user+session
  }

  return NextResponse.json({
    userId: user.id,
    bookId,
    chapterIds,
    ok: true,
  });
}

export async function DELETE() {
  if (!isTestSeedEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const { prisma } = await import("@/lib/prisma");

  await prisma.take.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.export.deleteMany();
  await prisma.book.deleteMany();

  return NextResponse.json({ ok: true });
}
