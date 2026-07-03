import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { createTestUser, createTestBook, createTestChapter, createTestTake } from "../../helpers/fixtures";

const drive = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadAudioToDrive: (...args: any[]) => drive.upload(...args),
}));

const mockSession = vi.hoisted(() => ({ value: null as any }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession.value)),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

import { backupTake } from "@/lib/take-backup";

function setAuth(id: string) { mockSession.value = { user: { id, email: "t@t.com", name: "T" } }; }

// createTestTake defaults audioFileUrl to /takes/test-take-abc123.webm — give the
// backup helper a real local original to read for the happy paths.
const TAKE_DIR = join(process.cwd(), "public", "takes");
const LOCAL_FILE = join(TAKE_DIR, "test-take-abc123.webm");

let userId: string;
let chapterId: string;

async function resetFixtures() {
  drive.upload.mockReset();
  await mkdir(TAKE_DIR, { recursive: true });
  await writeFile(LOCAL_FILE, Buffer.from("audio-bytes"));
  const u = await createTestUser(); userId = u.id;
  const b = await createTestBook(userId);
  const ch = await createTestChapter(b.id); chapterId = ch.id;
}

beforeAll(async () => { await mkdir(TAKE_DIR, { recursive: true }); });
afterAll(async () => { await rm(LOCAL_FILE, { force: true }); });

describe("backupTake helper", () => {
  beforeEach(resetFixtures);

  it("uploads the original and marks it backed_up on success", async () => {
    drive.upload.mockResolvedValue({ fileId: "drive-1", webViewLink: "" });
    const t = await createTestTake(chapterId, { backupStatus: "pending" });
    await backupTake(t.id, { delayMs: 0 });
    const after = await prisma.take.findUnique({ where: { id: t.id } });
    expect(after?.backupStatus).toBe("backed_up");
    expect(after?.audioDriveId).toBe("drive-1");
    expect(after?.backupError).toBeNull();
    expect(drive.upload).toHaveBeenCalledTimes(1);
  });

  it("retries after a transient failure, then succeeds", async () => {
    drive.upload
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({ fileId: "drive-2", webViewLink: "" });
    const t = await createTestTake(chapterId, { backupStatus: "pending" });
    await backupTake(t.id, { delayMs: 0 });
    const after = await prisma.take.findUnique({ where: { id: t.id } });
    expect(after?.backupStatus).toBe("backed_up");
    expect(drive.upload).toHaveBeenCalledTimes(2);
  });

  it("marks failed and records the error after exhausting retries", async () => {
    drive.upload.mockRejectedValue(new Error("Drive quota exceeded"));
    const t = await createTestTake(chapterId, { backupStatus: "pending" });
    await backupTake(t.id, { maxAttempts: 2, delayMs: 0 });
    const after = await prisma.take.findUnique({ where: { id: t.id } });
    expect(after?.backupStatus).toBe("failed");
    expect(after?.backupError).toContain("Drive quota exceeded");
    expect(drive.upload).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a take that already has a Drive file is not re-uploaded", async () => {
    const t = await createTestTake(chapterId, { audioDriveId: "existing-file", backupStatus: "backed_up" });
    await backupTake(t.id, { delayMs: 0 });
    expect(drive.upload).not.toHaveBeenCalled();
    const after = await prisma.take.findUnique({ where: { id: t.id } });
    expect(after?.backupStatus).toBe("backed_up");
  });

  it("marks failed (not backed up) when the local original is unavailable", async () => {
    drive.upload.mockResolvedValue({ fileId: "x", webViewLink: "" });
    const t = await createTestTake(chapterId, { backupStatus: "pending", audioFileUrl: "/takes/does-not-exist.webm" });
    await backupTake(t.id, { delayMs: 0 });
    const after = await prisma.take.findUnique({ where: { id: t.id } });
    expect(after?.backupStatus).toBe("failed");
    expect(after?.backupError).toContain("Local file unavailable");
    expect(drive.upload).not.toHaveBeenCalled();
  });
});

describe("POST /api/takes/[takeId]/backup", () => {
  beforeEach(async () => {
    await resetFixtures();
    setAuth(userId);
  });

  it("re-attempts the backup and returns the updated take", async () => {
    drive.upload.mockResolvedValue({ fileId: "drive-9", webViewLink: "" });
    const t = await createTestTake(chapterId, { backupStatus: "failed", backupError: "old error" });
    const { POST } = await import("@/app/api/takes/[takeId]/backup/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as never,
      { params: Promise.resolve({ takeId: t.id }) }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).take.backupStatus).toBe("backed_up");
  });

  it("returns 404 for another user's take", async () => {
    const other = await createTestUser({ email: "o@t.com", googleId: "g-o" });
    const ob = await createTestBook(other.id);
    const oc = await createTestChapter(ob.id);
    const t = await createTestTake(oc.id);
    const { POST } = await import("@/app/api/takes/[takeId]/backup/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as never,
      { params: Promise.resolve({ takeId: t.id }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession.value = null;
    const t = await createTestTake(chapterId);
    const { POST } = await import("@/app/api/takes/[takeId]/backup/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }) as never,
      { params: Promise.resolve({ takeId: t.id }) }
    );
    expect(res.status).toBe(401);
  });
});
