import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { access, rm } from "fs/promises";
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

const drive = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadDriveFile: (...args: any[]) => drive.download(...args),
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

const RESTORE_URL = "/takes/process-restore-xyz.webm";
const RESTORE_PATH = join(process.cwd(), "public", "takes", "process-restore-xyz.webm");

describe("POST /api/chapters/[chapterId]/process — restores missing originals", () => {
  beforeEach(async () => { redisPushed.jobs = []; drive.download.mockReset(); await rm(RESTORE_PATH, { force: true }); });
  afterEach(async () => { await rm(RESTORE_PATH, { force: true }); });

  it("pulls a missing original back from Drive before enqueuing the job", async () => {
    drive.download.mockResolvedValue(Buffer.from("restored-audio"));
    const u = await createTestUser(); setAuth(u.id);
    const b = await createTestBook(u.id);
    const ch = await createTestChapter(b.id);
    const t = await createTestTake(ch.id, { audioFileUrl: RESTORE_URL, audioDriveId: "drive-file-1", regionStart: 0, regionEnd: 5 });

    // Precondition: the local original is gone.
    await expect(access(RESTORE_PATH)).rejects.toBeTruthy();

    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as never,
      { params: Promise.resolve({ chapterId: ch.id }) }
    );

    expect(res.status).toBe(200);
    expect(drive.download).toHaveBeenCalledWith(u.id, "drive-file-1");
    // The original is back on disk and the job was enqueued for it.
    await expect(access(RESTORE_PATH)).resolves.toBeUndefined();
    expect(redisPushed.jobs.length).toBe(1);
    expect(JSON.parse(redisPushed.jobs[0]).takes[0].takeId).toBe(t.id);
    expect((await prisma.chapter.findUnique({ where: { id: ch.id } }))?.processStatus).toBe("processing");
  });

  it("returns 400 (nothing to process) when a take has no local file and no Drive backup", async () => {
    const u = await createTestUser(); setAuth(u.id);
    const b = await createTestBook(u.id);
    const ch = await createTestChapter(b.id);
    await createTestTake(ch.id, { audioFileUrl: "/takes/gone-forever.webm", audioDriveId: null, regionStart: 0, regionEnd: 5 });

    const { POST } = await import("@/app/api/chapters/[chapterId]/process/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as never,
      { params: Promise.resolve({ chapterId: ch.id }) }
    );

    expect(res.status).toBe(400);
    expect(drive.download).not.toHaveBeenCalled();
    expect(redisPushed.jobs.length).toBe(0);
  });
});
