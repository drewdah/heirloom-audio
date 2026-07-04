import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestUser, createTestBook, createTestChapter, createTestTake } from "../../helpers/fixtures";

// Stub the actual Drive upload — the sweep's job is to *find and re-run* stuck
// takes; backupTake has its own suite. Here it just marks them backed_up.
vi.mock("@/lib/take-backup", () => ({
  backupTake: vi.fn(async (id: string) => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.take.update({ where: { id }, data: { backupStatus: "backed_up", audioDriveId: "swept-drive-id" } });
  }),
}));

const SWEEP = "/api/admin/backup-sweep";
const req = (headers: Record<string, string> = {}) =>
  new Request(`http://localhost${SWEEP}`, { method: "POST", headers }) as never;

const origSecret = process.env.SWEEP_SECRET;
afterEach(() => {
  if (origSecret === undefined) delete process.env.SWEEP_SECRET;
  else process.env.SWEEP_SECRET = origSecret;
});

let chapterId: string;
beforeEach(async () => {
  const u = await createTestUser();
  const b = await createTestBook(u.id);
  const c = await createTestChapter(b.id);
  chapterId = c.id;
});

describe("POST /api/admin/backup-sweep", () => {
  it("401s when SWEEP_SECRET is unset (endpoint disabled)", async () => {
    delete process.env.SWEEP_SECRET;
    const { POST } = await import("@/app/api/admin/backup-sweep/route");
    expect((await POST(req({ authorization: "Bearer anything" }))).status).toBe(401);
  });

  it("401s on a missing or wrong bearer token", async () => {
    process.env.SWEEP_SECRET = "s3cret";
    const { POST } = await import("@/app/api/admin/backup-sweep/route");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("re-runs backup on pending/failed takes and reports counts", async () => {
    process.env.SWEEP_SECRET = "s3cret";
    // eligible: has a local original, no Drive copy yet, stuck pending/failed
    await createTestTake(chapterId, { label: "P", audioFileUrl: "/takes/p.webm", backupStatus: "pending" });
    await createTestTake(chapterId, { label: "F", audioFileUrl: "/takes/f.webm", backupStatus: "failed" });
    // not eligible: already backed up
    await createTestTake(chapterId, { label: "OK", audioFileUrl: "/takes/ok.webm", backupStatus: "backed_up", audioDriveId: "existing" });

    const { POST } = await import("@/app/api/admin/backup-sweep/route");
    const res = await POST(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ swept: 2, backedUp: 2, failed: 0 });

    // The two stuck takes are now backed up; the already-backed-up one is untouched
    const statuses = await prisma.take.groupBy({ by: ["backupStatus"], _count: true });
    expect(statuses).toEqual([{ backupStatus: "backed_up", _count: 3 }]);
  });

  it("skips takes with no local original", async () => {
    process.env.SWEEP_SECRET = "s3cret";
    await createTestTake(chapterId, { label: "NoFile", audioFileUrl: null, backupStatus: "failed" });
    const { POST } = await import("@/app/api/admin/backup-sweep/route");
    const res = await POST(req({ authorization: "Bearer s3cret" }));
    expect(await res.json()).toEqual({ swept: 0, backedUp: 0, failed: 0 });
  });
});
