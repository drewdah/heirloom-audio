import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

function setAuth(userId: string) {
  mockSession.value = { user: { id: userId, email: "testuser@example.com", name: "Test User" } };
}
function clearAuth() { mockSession.value = null; }

let userId: string;
let bookId: string;

describe("PATCH /api/chapters/[chapterId]", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("updates chapter title", async () => {
    const ch = await createTestChapter(bookId, { title: "Old" });
    const { PATCH } = await import("@/app/api/chapters/[chapterId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "New" }) }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("New");
  });

  it("sets groupTitle", async () => {
    const ch = await createTestChapter(bookId);
    const { PATCH } = await import("@/app/api/chapters/[chapterId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ groupTitle: "Genesis" }) }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).groupTitle).toBe("Genesis");
  });

  it("clears groupTitle when set to empty string", async () => {
    const ch = await createTestChapter(bookId, { groupTitle: "Genesis" });
    const { PATCH } = await import("@/app/api/chapters/[chapterId]/route");
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ groupTitle: "" }) }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).groupTitle).toBeNull();
  });

  it("returns 404 for another user's chapter", async () => {
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const ob = await createTestBook(other.id);
    const ch = await createTestChapter(ob.id);
    const { PATCH } = await import("@/app/api/chapters/[chapterId]/route");
    expect((await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "X" }) }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    )).status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const ch = await createTestChapter(bookId);
    clearAuth();
    const { PATCH } = await import("@/app/api/chapters/[chapterId]/route");
    expect((await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "X" }) }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    )).status).toBe(401);
  });
});

describe("DELETE /api/chapters/[chapterId]", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("deletes the chapter", async () => {
    const ch = await createTestChapter(bookId);
    const { DELETE } = await import("@/app/api/chapters/[chapterId]/route");
    expect((await DELETE(
      new Request("http://localhost", { method: "DELETE" }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    )).status).toBe(200);
    expect(await prisma.chapter.findUnique({ where: { id: ch.id } })).toBeNull();
  });

  it("returns 404 for another user's chapter", async () => {
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const ob = await createTestBook(other.id);
    const ch = await createTestChapter(ob.id);
    const { DELETE } = await import("@/app/api/chapters/[chapterId]/route");
    expect((await DELETE(
      new Request("http://localhost", { method: "DELETE" }) as any,
      { params: Promise.resolve({ chapterId: ch.id }) }
    )).status).toBe(404);
  });
});

describe("PUT /api/books/[bookId]/chapters/reorder", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("reorders chapters by the provided ID array", async () => {
    const ch1 = await createTestChapter(bookId, { order: 1, title: "First" });
    const ch2 = await createTestChapter(bookId, { order: 2, title: "Second" });
    const ch3 = await createTestChapter(bookId, { order: 3, title: "Third" });
    const { PUT } = await import("@/app/api/books/[bookId]/chapters/reorder/route");
    expect((await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ orderedIds: [ch3.id, ch1.id, ch2.id] }) }) as any,
      { params: Promise.resolve({ bookId }) }
    )).status).toBe(200);
    const chapters = await prisma.chapter.findMany({ where: { bookId }, orderBy: { order: "asc" } });
    expect(chapters.map(c => c.title)).toEqual(["Third", "First", "Second"]);
  });

  it("returns 404 for another user's book", async () => {
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const ob = await createTestBook(other.id);
    const { PUT } = await import("@/app/api/books/[bookId]/chapters/reorder/route");
    expect((await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ orderedIds: [] }) }) as any,
      { params: Promise.resolve({ bookId: ob.id }) }
    )).status).toBe(404);
  });
});
