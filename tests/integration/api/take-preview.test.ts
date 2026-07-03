import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter, createTestTake } from "../../helpers/fixtures";

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/google-drive", () => ({
  downloadDriveFile: vi.fn(() => Promise.resolve(Buffer.from("restored"))),
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

const TAKE_DIR = join(process.cwd(), "public", "takes");
const LOCAL_FILE = join(TAKE_DIR, "test-take-abc123.webm"); // createTestTake default audioFileUrl

let userId: string;
let chapterId: string;

async function withLocalFile() {
  await mkdir(TAKE_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, Buffer.from("audio"));
}

describe("take preview endpoints", () => {
  beforeEach(async () => {
    redisPushed.jobs = [];
    await rm(LOCAL_FILE, { force: true });
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id); chapterId = ch.id;
    setAuth(userId);
  });
  afterEach(async () => { await rm(LOCAL_FILE, { force: true }); });

  it("POST enqueues a preview job and marks the take processing", async () => {
    await withLocalFile();
    const t = await createTestTake(chapterId);
    const { POST } = await import("@/app/api/takes/[takeId]/preview/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as never, { params: Promise.resolve({ takeId: t.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("processing");
    expect((await prisma.take.findUnique({ where: { id: t.id } }))?.previewStatus).toBe("processing");
    expect(redisPushed.jobs).toHaveLength(1);
    const job = JSON.parse(redisPushed.jobs[0]);
    expect(job.type).toBe("preview_take");
    expect(job.takeId).toBe(t.id);
    // Covers the take's full visible region (regionEnd 10.5 - regionStart 0 + 0.5), not a fixed snippet
    expect(job.previewSeconds).toBeCloseTo(11, 1);
  });

  it("POST returns 409 when the original can't be made available", async () => {
    // No local file and no Drive backup → not restorable.
    const t = await createTestTake(chapterId, { audioFileUrl: "/takes/missing.webm", audioDriveId: null });
    const { POST } = await import("@/app/api/takes/[takeId]/preview/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as never, { params: Promise.resolve({ takeId: t.id }) });
    expect(res.status).toBe(409);
    expect(redisPushed.jobs).toHaveLength(0);
  });

  it("GET returns preview status and snippet URLs", async () => {
    const t = await createTestTake(chapterId, { previewStatus: "done" });
    const { GET } = await import("@/app/api/takes/[takeId]/preview/route");
    const res = await GET(new Request("http://localhost") as never, { params: Promise.resolve({ takeId: t.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.previewStatus).toBe("done");
    expect(body.rawUrl).toBe("/takes/test-take-abc123_preview_raw.wav");
    expect(body.processedUrl).toBe("/takes/test-take-abc123_preview.wav");
  });

  it("POST returns 404 for another user's take", async () => {
    const other = await createTestUser({ email: "o@t.com", googleId: "g-o" });
    const ob = await createTestBook(other.id);
    const oc = await createTestChapter(ob.id);
    const t = await createTestTake(oc.id);
    const { POST } = await import("@/app/api/takes/[takeId]/preview/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as never, { params: Promise.resolve({ takeId: t.id }) });
    expect(res.status).toBe(404);
  });

  it("POST returns 401 when unauthenticated", async () => {
    mockSession.value = null;
    const t = await createTestTake(chapterId);
    const { POST } = await import("@/app/api/takes/[takeId]/preview/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }) as never, { params: Promise.resolve({ takeId: t.id }) });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/takes/[takeId]/preview/callback", () => {
  beforeEach(async () => {
    const u = await createTestUser(); userId = u.id;
    const b = await createTestBook(userId);
    const ch = await createTestChapter(b.id); chapterId = ch.id;
  });

  it("marks the take preview done with a valid secret", async () => {
    const t = await createTestTake(chapterId, { previewStatus: "processing" });
    const { POST } = await import("@/app/api/takes/[takeId]/preview/callback/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ secret: process.env.NEXTAUTH_SECRET, status: "done" }) }) as never,
      { params: Promise.resolve({ takeId: t.id }) }
    );
    expect(res.status).toBe(200);
    expect((await prisma.take.findUnique({ where: { id: t.id } }))?.previewStatus).toBe("done");
  });

  it("rejects a callback with a bad secret", async () => {
    const t = await createTestTake(chapterId, { previewStatus: "processing" });
    const { POST } = await import("@/app/api/takes/[takeId]/preview/callback/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ secret: "wrong", status: "done" }) }) as never,
      { params: Promise.resolve({ takeId: t.id }) }
    );
    expect(res.status).toBe(401);
    expect((await prisma.take.findUnique({ where: { id: t.id } }))?.previewStatus).toBe("processing");
  });
});
