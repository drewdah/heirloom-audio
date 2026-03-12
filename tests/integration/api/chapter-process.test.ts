import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter, createTestTake } from "../../helpers/fixtures";

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
let userId: string, bookId: string;

describe("POST /api/chapters/[chapterId]/process", () => {
  beforeEach(async () => {
    redisPushed.jobs = [];
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("queues a processing job with correct take paths", async () => {
    const ch = await createTestChapter(bookId);
    // Route uses .replace("/takes/", "") so URL must start with /takes/
    await createTestTake(ch.id, { audioFileUrl: "/takes/take-abc123.webm", durationSeconds: 15, regionStart: 0, regionEnd: 15 });
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("processing");
    expect(redisPushed.jobs).toHaveLength(1);
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.type).toBe("process_chapter");
    expect(job.takes[0].filePath).toBe("/app/public/takes/take-abc123.webm");
  });

  it("handles multiple takes ordered by regionStart", async () => {
    const ch = await createTestChapter(bookId);
    await createTestTake(ch.id, { label: "T2", audioFileUrl: "/takes/second.webm", regionStart: 10, regionEnd: 20, durationSeconds: 10 });
    await createTestTake(ch.id, { label: "T1", audioFileUrl: "/takes/first.webm", regionStart: 0, regionEnd: 10, durationSeconds: 10 });
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) });
    expect(res.status).toBe(200);
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.takes[0].regionStart).toBe(0);
    expect(job.takes[1].regionStart).toBe(10);
  });

  it("marks chapter processStatus as processing", async () => {
    const ch = await createTestChapter(bookId);
    await createTestTake(ch.id);
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) });
    expect((await prisma.chapter.findUnique({ where: { id: ch.id } }))?.processStatus).toBe("processing");
  });

  it("rejects when no active takes", async () => {
    const ch = await createTestChapter(bookId);
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    expect((await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) })).status).toBe(400);
  });

  it("skips inactive takes", async () => {
    const ch = await createTestChapter(bookId);
    await createTestTake(ch.id, { isActive: false });
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    expect((await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) })).status).toBe(400);
  });

  it("returns 404 for another user's chapter", async () => {
    const other = await createTestUser({ email: "o@t.com", googleId: "g-o" });
    const ob = await createTestBook(other.id);
    const ch = await createTestChapter(ob.id);
    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    expect((await POST(new Request("http://localhost", { method: "POST" }) as any, { params: Promise.resolve({ chapterId: ch.id }) })).status).toBe(404);
  });
});

describe("GET /api/chapters/[chapterId]/process", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId); bookId = b.id;
    setAuth(userId);
  });

  it("returns current processing status", async () => {
    const ch = await createTestChapter(bookId, { processStatus: "processing" });
    // processedFileUrl is stored as-is (not parsed by the GET route), so any format works here
    await createTestTake(ch.id, { processedFileUrl: "/takes/processed.wav" });
    const { GET } = await import("@/app/api/chapters/[chapterId]/process/route");
    const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ chapterId: ch.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapter.processStatus).toBe("processing");
    expect(body.chapter.takes[0].processedFileUrl).toBe("/takes/processed.wav");
  });

  it("returns 404 for nonexistent chapter", async () => {
    const { GET } = await import("@/app/api/chapters/[chapterId]/process/route");
    expect((await GET(new Request("http://localhost") as any, { params: Promise.resolve({ chapterId: "nope" }) })).status).toBe(404);
  });
});
