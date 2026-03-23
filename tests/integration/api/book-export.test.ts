import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter, createTestTake, createTestExport } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() }, signIn: vi.fn(), signOut: vi.fn(),
}));

const redisPushed = vi.hoisted(() => ({ jobs: [] as string[] }));
vi.mock("redis", () => ({
  createClient: () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    rPush: vi.fn().mockImplementation((_k: string, v: string) => { redisPushed.jobs.push(v); return Promise.resolve(1); }),
    quit: vi.fn().mockResolvedValue(undefined),
  }),
}));

function setAuth(id: string) { mockSession.value = { user: { id, email: "t@t.com", name: "T" } }; }
let userId: string;

describe("POST /api/books/[bookId]/export", () => {
  beforeEach(async () => {
    redisPushed.jobs = [];
    const u = await createTestUser(); userId = u.id; setAuth(userId);
  });

  it("rejects when chapters are not complete", async () => {
    const b = await createTestBook(userId);
    await createTestChapter(b.id, { recordingComplete: false });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("incomplete_chapters");
  });

  it("rejects when chapters are not processed", async () => {
    const b = await createTestBook(userId);
    await createTestChapter(b.id, { recordingComplete: true, processStatus: "idle" });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("unprocessed_chapters");
  });

  it("creates export record and queues job when ready", async () => {
    const b = await createTestBook(userId, { title: "The Bible" });
    const ch = await createTestChapter(b.id, { recordingComplete: true, processStatus: "done" });
    await createTestTake(ch.id, { processedFileUrl: "/takes/proc.wav" });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versionTag).toMatch(/^v\d{4}-\d{2}-\d{2}-\d{4}$/);
    expect(body.status).toBe("pending");
    const exports = await prisma.export.findMany({ where: { bookId: b.id } });
    expect(exports).toHaveLength(1);
    expect(exports[0].version).toBe(1);
    expect((await prisma.book.findUnique({ where: { id: b.id } }))?.exportStatus).toBe("exporting");
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.type).toBe("export_book");
    expect(job.metadata.title).toBe("The Bible");
    expect(job.chapters[0].takes[0].isProcessed).toBe(true);
  });

  it("increments version number", async () => {
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id, { recordingComplete: true, processStatus: "done" });
    await createTestTake(ch.id);
    await createTestExport(b.id, { version: 1, exportStatus: "done" });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(200);
    const exports = await prisma.export.findMany({ where: { bookId: b.id }, orderBy: { version: "asc" } });
    expect(exports[1].version).toBe(2);
  });

  it("prefers processedFileUrl in job", async () => {
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id, { recordingComplete: true, processStatus: "done" });
    // Route uses .split("/").pop() so any URL prefix works
    await createTestTake(ch.id, { audioFileUrl: "/takes/raw.webm", processedFileUrl: "/takes/processed.wav" });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.chapters[0].takes[0].filePath).toBe("/app/public/takes/processed.wav");
    expect(job.chapters[0].takes[0].isProcessed).toBe(true);
  });

  it("handles /api/takes/ prefixed processedFileUrl (legacy format)", async () => {
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id, { recordingComplete: true, processStatus: "done" });
    // Older worker versions stored processedFileUrl as "/api/takes/xxx_processed.wav"
    await createTestTake(ch.id, { audioFileUrl: "/takes/raw.webm", processedFileUrl: "/api/takes/processed.wav" });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.chapters[0].takes[0].filePath).toBe("/app/public/takes/processed.wav");
  });

  it("falls back to raw audioFileUrl", async () => {
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id, { recordingComplete: true, processStatus: "done" });
    await createTestTake(ch.id, { audioFileUrl: "/takes/raw.webm", processedFileUrl: null });
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: b.id }) });
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.chapters[0].takes[0].filePath).toBe("/app/public/takes/raw.webm");
    expect(job.chapters[0].takes[0].isProcessed).toBe(false);
  });

  it("returns 404 for another user's book", async () => {
    const other = await createTestUser({ email: "o@t.com", googleId: "g-o" });
    const ob = await createTestBook(other.id);
    const { POST } = await import("@/app/api/books/[bookId]/export/route");
    expect((await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ bookId: ob.id }) })).status).toBe(404);
  });
});

describe("GET /api/books/[bookId]/export", () => {
  beforeEach(async () => { const u = await createTestUser(); userId = u.id; setAuth(userId); });

  it("returns latest export status", async () => {
    const b = await createTestBook(userId, { exportStatus: "done" });
    await createTestExport(b.id, { version: 1, exportStatus: "done", exportFileUrl: "/exports/v1.m4b" });
    const { GET } = await import("@/app/api/books/[bookId]/export/route");
    const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exportStatus).toBe("done");
    expect(body.latestExport.version).toBe(1);
  });

  it("returns null latestExport when none exist", async () => {
    const b = await createTestBook(userId);
    const { GET } = await import("@/app/api/books/[bookId]/export/route");
    const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ bookId: b.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).latestExport).toBeNull();
  });

  it("returns 404 for nonexistent book", async () => {
    const { GET } = await import("@/app/api/books/[bookId]/export/route");
    expect((await GET(new Request("http://localhost") as any, { params: Promise.resolve({ bookId: "nope" }) })).status).toBe(404);
  });
});
