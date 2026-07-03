import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { ensureLocalOriginal, ensureOriginalsLocal, localPathForUrl } from "@/lib/take-restore";

const drive = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("@/lib/google-drive", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadDriveFile: (...args: any[]) => drive.download(...args),
}));

const TAKE_DIR = join(process.cwd(), "public", "takes");
const created: string[] = [];

async function writeLocal(url: string, bytes = Buffer.from("local-bytes")) {
  await mkdir(TAKE_DIR, { recursive: true });
  const p = localPathForUrl(url);
  await writeFile(p, bytes);
  created.push(p);
}
function track(url: string) { created.push(localPathForUrl(url)); }

beforeEach(() => { drive.download.mockReset(); });
afterEach(async () => { await Promise.all(created.splice(0).map((p) => rm(p, { force: true }))); });

describe("ensureLocalOriginal", () => {
  it("no-ops when the local original already exists", async () => {
    const url = "/takes/restore-present.webm";
    await writeLocal(url);
    const r = await ensureLocalOriginal({ id: "t1", audioFileUrl: url, audioDriveId: "drive-1" }, "user-1");
    expect(r).toEqual({ available: true, restored: false });
    expect(drive.download).not.toHaveBeenCalled();
  });

  it("restores from Drive when the local original is missing", async () => {
    const url = "/takes/restore-missing.webm";
    track(url);
    drive.download.mockResolvedValue(Buffer.from("restored-bytes"));
    const r = await ensureLocalOriginal({ id: "t2", audioFileUrl: url, audioDriveId: "drive-2" }, "user-1");
    expect(r).toEqual({ available: true, restored: true });
    expect(drive.download).toHaveBeenCalledWith("user-1", "drive-2");
    expect((await readFile(localPathForUrl(url))).toString()).toBe("restored-bytes");
  });

  it("cannot restore when there is no Drive backup", async () => {
    const url = "/takes/restore-none.webm";
    track(url);
    const r = await ensureLocalOriginal({ id: "t3", audioFileUrl: url, audioDriveId: null }, "user-1");
    expect(r).toEqual({ available: false, restored: false });
    expect(drive.download).not.toHaveBeenCalled();
  });
});

describe("ensureOriginalsLocal", () => {
  it("restores missing originals, keeps present ones, drops the unrecoverable", async () => {
    const present = "/takes/batch-present.webm";
    const restorable = "/takes/batch-restorable.webm";
    const lost = "/takes/batch-lost.webm";
    await writeLocal(present);
    track(restorable); track(lost);
    drive.download.mockResolvedValue(Buffer.from("x"));
    const takes = [
      { id: "a", audioFileUrl: present, audioDriveId: "d-a" },
      { id: "b", audioFileUrl: restorable, audioDriveId: "d-b" },
      { id: "c", audioFileUrl: lost, audioDriveId: null },
    ];
    const { available, restoredCount } = await ensureOriginalsLocal(takes, "user-1");
    expect(available.map((t) => t.id)).toEqual(["a", "b"]);
    expect(restoredCount).toBe(1);
    expect(drive.download).toHaveBeenCalledTimes(1);
  });

  it("drops a take whose Drive download fails without failing the batch", async () => {
    const ok = "/takes/batch-ok.webm";
    const fails = "/takes/batch-fails.webm";
    await writeLocal(ok);
    track(fails);
    drive.download.mockRejectedValue(new Error("Drive 404"));
    const takes = [
      { id: "a", audioFileUrl: ok, audioDriveId: "d-a" },
      { id: "b", audioFileUrl: fails, audioDriveId: "d-b" },
    ];
    const { available, restoredCount } = await ensureOriginalsLocal(takes, "user-1");
    expect(available.map((t) => t.id)).toEqual(["a"]);
    expect(restoredCount).toBe(0);
  });
});
