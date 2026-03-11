import { prisma } from "../../src/lib/prisma";

export async function createTestUser(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email: "testuser@example.com",
      name: "Test User",
      googleId: "google-test-123",
      ...overrides,
    },
  });
}

export async function createTestBook(userId: string, overrides: Record<string, unknown> = {}) {
  return prisma.book.create({
    data: {
      userId,
      title: "Test Book",
      author: "Test Author",
      language: "en",
      versionTag: "v1-2026-01-01-00h00m",
      ...overrides,
    },
  });
}

export async function createTestChapter(bookId: string, overrides: Record<string, unknown> = {}) {
  return prisma.chapter.create({
    data: {
      bookId,
      order: 1,
      title: "Chapter 1",
      ...overrides,
    },
  });
}

export async function createTestTake(chapterId: string, overrides: Record<string, unknown> = {}) {
  return prisma.take.create({
    data: {
      chapterId,
      label: "Take 1",
      audioFileUrl: "/api/takes/test-take-abc123.webm",
      durationSeconds: 10.5,
      regionStart: 0,
      regionEnd: 10.5,
      ...overrides,
    },
  });
}

export async function createTestExport(bookId: string, overrides: Record<string, unknown> = {}) {
  return prisma.export.create({
    data: {
      bookId,
      version: 1,
      versionTag: "v2026-01-01-0000",
      exportStatus: "pending",
      ...overrides,
    },
  });
}
