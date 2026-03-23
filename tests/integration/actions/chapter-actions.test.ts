import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() }, signIn: vi.fn(), signOut: vi.fn(),
}));

// Prevent redirect() from throwing — capture the destination instead
const redirected = vi.hoisted(() => ({ to: null as string | null }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { redirected.to = url; }),
  notFound: vi.fn(),
}));

function setAuth(id: string) {
  mockSession.value = { user: { id, email: "t@t.com", name: "T" } };
}

function makeFormData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

let userId: string, bookId: string;

describe("createBatchChapters", () => {
  beforeEach(async () => {
    redirected.to = null;
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("creates the correct number of chapters", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "Genesis", count: "5", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { order: "asc" } });
    expect(chapters).toHaveLength(5);
  });

  it("generates correct chapter titles starting from 1", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "3", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { order: "asc" } });
    expect(chapters.map(c => c.title)).toEqual(["Chapter 1", "Chapter 2", "Chapter 3"]);
  });

  it("respects a custom startFrom", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "3", startFrom: "10" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { order: "asc" } });
    expect(chapters.map(c => c.title)).toEqual(["Chapter 10", "Chapter 11", "Chapter 12"]);
  });

  it("assigns groupTitle to all created chapters", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "Genesis", count: "3", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters.every(c => c.groupTitle === "Genesis")).toBe(true);
  });

  it("uses null groupTitle when blank", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "2", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters.every(c => c.groupTitle === null)).toBe(true);
  });

  it("assigns sequential order starting after existing chapters", async () => {
    await createTestChapter(bookId, { order: 1 });
    await createTestChapter(bookId, { order: 2 });
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "3", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { order: "asc" } });
    expect(chapters.map(c => c.order)).toEqual([1, 2, 3, 4, 5]);
  });

  it("redirects to the book page after creation", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "2", startFrom: "1" }));
    expect(redirected.to).toBe(`/books/${bookId}`);
  });

  it("does nothing when count is 0", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "0", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters).toHaveLength(0);
  });

  it("does nothing when count exceeds 500", async () => {
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(bookId, makeFormData({ groupTitle: "", count: "501", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters).toHaveLength(0);
  });

  it("does nothing for another user's book", async () => {
    const other = await createTestUser({ email: "o@t.com", googleId: "g-o" });
    const ob = await createTestBook(other.id);
    const { createBatchChapters } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createBatchChapters(ob.id, makeFormData({ groupTitle: "", count: "5", startFrom: "1" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId: ob.id } });
    expect(chapters).toHaveLength(0);
  });
});

describe("createChapter", () => {
  beforeEach(async () => {
    redirected.to = null;
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("creates a chapter and redirects to it", async () => {
    const { createChapter } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createChapter(bookId, makeFormData({ title: "Intro", groupTitle: "" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Intro");
    expect(redirected.to).toMatch(new RegExp(`^/books/${bookId}/chapters/`));
  });

  it("assigns groupTitle when provided", async () => {
    const { createChapter } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createChapter(bookId, makeFormData({ title: "Chapter 1", groupTitle: "Genesis" }));
    const chapter = await prisma.chapter.findFirst({ where: { bookId } });
    expect(chapter?.groupTitle).toBe("Genesis");
  });

  it("does nothing when title is empty", async () => {
    const { createChapter } = await import("@/app/(authenticated)/books/[bookId]/chapters/new/actions");
    await createChapter(bookId, makeFormData({ title: "  ", groupTitle: "" }));
    const chapters = await prisma.chapter.findMany({ where: { bookId } });
    expect(chapters).toHaveLength(0);
  });
});
