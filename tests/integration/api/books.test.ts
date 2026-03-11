import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook } from "../../helpers/fixtures";

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
function jsonReq(method: string, body?: unknown) {
  return new Request("http://localhost/api/books", {
    method, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/books", () => {
  let userId: string;
  beforeEach(async () => { const u = await createTestUser(); userId = u.id; setAuth(userId); });

  it("creates a book with valid data and returns 201", async () => {
    const { POST } = await import("@/app/api/books/route");
    const res = await POST(jsonReq("POST", { title: "The Hobbit", author: "J.R.R. Tolkien", narrator: "Dad" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("The Hobbit");
    expect(body.author).toBe("J.R.R. Tolkien");
    expect(body.userId).toBe(userId);
    expect(body.versionTag).toMatch(/^v1-/);
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.language).toBe("en");
  });

  it("applies default language when not provided", async () => {
    const { POST } = await import("@/app/api/books/route");
    const res = await POST(jsonReq("POST", { title: "Test", author: "Author" }));
    expect(res.status).toBe(201);
    expect((await res.json()).language).toBe("en");
  });

  it("rejects missing title with 400", async () => {
    const { POST } = await import("@/app/api/books/route");
    expect((await POST(jsonReq("POST", { author: "Author" }))).status).toBe(400);
  });

  it("rejects missing author with 400", async () => {
    const { POST } = await import("@/app/api/books/route");
    expect((await POST(jsonReq("POST", { title: "Title" }))).status).toBe(400);
  });

  it("rejects empty title with 400", async () => {
    const { POST } = await import("@/app/api/books/route");
    expect((await POST(jsonReq("POST", { title: "", author: "A" }))).status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    clearAuth();
    const { POST } = await import("@/app/api/books/route");
    expect((await POST(jsonReq("POST", { title: "T", author: "A" }))).status).toBe(401);
  });

  it("returns 401 for stale session (user not in DB)", async () => {
    setAuth("nonexistent-user-id");
    const { POST } = await import("@/app/api/books/route");
    expect((await POST(jsonReq("POST", { title: "T", author: "A" }))).status).toBe(401);
  });
});

describe("GET /api/books", () => {
  it("returns only books owned by the authenticated user", async () => {
    const u1 = await createTestUser({ email: "u1@test.com", googleId: "g1" });
    const u2 = await createTestUser({ email: "u2@test.com", googleId: "g2" });
    await createTestBook(u1.id, { title: "User1 Book" });
    await createTestBook(u2.id, { title: "User2 Book" });
    setAuth(u1.id);
    const { GET } = await import("@/app/api/books/route");
    const books = await (await GET()).json();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe("User1 Book");
  });

  it("returns books with chapters included", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id);
    await prisma.chapter.create({ data: { bookId: b.id, order: 1, title: "Chapter 1" } });
    setAuth(u.id);
    const { GET } = await import("@/app/api/books/route");
    const books = await (await GET()).json();
    expect(books[0].chapters).toHaveLength(1);
    expect(books[0].chapters[0].title).toBe("Chapter 1");
  });

  it("returns 401 when not authenticated", async () => {
    clearAuth();
    const { GET } = await import("@/app/api/books/route");
    expect((await GET()).status).toBe(401);
  });
});

describe("GET /api/books/[bookId]", () => {
  it("returns the book with chapters and exports", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id, { title: "My Book" });
    await prisma.chapter.create({ data: { bookId: b.id, order: 1, title: "Ch1" } });
    setAuth(u.id);
    const { GET } = await import("@/app/api/books/[bookId]/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("My Book");
    expect(body.chapters).toHaveLength(1);
  });

  it("returns 404 for another user's book", async () => {
    const owner = await createTestUser({ email: "owner@test.com", googleId: "g-owner" });
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const b = await createTestBook(owner.id);
    setAuth(other.id);
    const { GET } = await import("@/app/api/books/[bookId]/route");
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ bookId: b.id }) })).status).toBe(404);
  });

  it("returns 404 for nonexistent book", async () => {
    const u = await createTestUser();
    setAuth(u.id);
    const { GET } = await import("@/app/api/books/[bookId]/route");
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ bookId: "nope" }) })).status).toBe(404);
  });
});

describe("PUT /api/books/[bookId]", () => {
  it("updates book fields", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id, { title: "Old" });
    setAuth(u.id);
    const { PUT } = await import("@/app/api/books/[bookId]/route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ title: "New", genre: "Religion" }) }),
      { params: Promise.resolve({ bookId: b.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("New");
    expect(body.genre).toBe("Religion");
    expect(body.author).toBe("Test Author");
  });

  it("updates book status", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id);
    setAuth(u.id);
    const { PUT } = await import("@/app/api/books/[bookId]/route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ status: "COMPLETE" }) }),
      { params: Promise.resolve({ bookId: b.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("COMPLETE");
  });

  it("rejects invalid status", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id);
    setAuth(u.id);
    const { PUT } = await import("@/app/api/books/[bookId]/route");
    const res = await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ status: "INVALID" }) }),
      { params: Promise.resolve({ bookId: b.id }) }
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's book", async () => {
    const owner = await createTestUser({ email: "owner@test.com", googleId: "g-owner" });
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const b = await createTestBook(owner.id);
    setAuth(other.id);
    const { PUT } = await import("@/app/api/books/[bookId]/route");
    expect((await PUT(
      new Request("http://localhost", { method: "PUT", body: JSON.stringify({ title: "X" }) }),
      { params: Promise.resolve({ bookId: b.id }) }
    )).status).toBe(404);
  });
});

describe("DELETE /api/books/[bookId]", () => {
  it("deletes the book and cascades to chapters", async () => {
    const u = await createTestUser();
    const b = await createTestBook(u.id);
    await prisma.chapter.create({ data: { bookId: b.id, order: 1, title: "Ch1" } });
    setAuth(u.id);
    const { DELETE } = await import("@/app/api/books/[bookId]/route");
    const res = await DELETE(
      new Request("http://localhost/api/books/x", { method: "DELETE" }),
      { params: Promise.resolve({ bookId: b.id }) }
    );
    expect(res.status).toBe(200);
    expect(await prisma.book.findUnique({ where: { id: b.id } })).toBeNull();
    expect(await prisma.chapter.findMany({ where: { bookId: b.id } })).toHaveLength(0);
  });

  it("returns 404 for another user's book", async () => {
    const owner = await createTestUser({ email: "owner@test.com", googleId: "g-owner" });
    const other = await createTestUser({ email: "other@test.com", googleId: "g-other" });
    const b = await createTestBook(owner.id);
    setAuth(other.id);
    const { DELETE } = await import("@/app/api/books/[bookId]/route");
    expect((await DELETE(
      new Request("http://localhost/api/books/x", { method: "DELETE" }),
      { params: Promise.resolve({ bookId: b.id }) }
    )).status).toBe(404);
    expect(await prisma.book.findUnique({ where: { id: b.id } })).not.toBeNull();
  });
});
