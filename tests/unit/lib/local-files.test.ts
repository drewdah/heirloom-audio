import { describe, it, expect } from "vitest";
import { mkdir, writeFile, rm, access } from "fs/promises";
import { join } from "path";
import { unlinkTakeLocalFiles } from "@/lib/local-files";

const PUBLIC = join(process.cwd(), "public");
const abs = (u: string) => join(PUBLIC, u.replace(/^\//, ""));
const exists = (u: string) => access(abs(u)).then(() => true).catch(() => false);
async function write(u: string) {
  await mkdir(join(abs(u), ".."), { recursive: true });
  await writeFile(abs(u), "x");
}

describe("unlinkTakeLocalFiles", () => {
  it("removes the original, processed WAV, and preview snippets", async () => {
    await write("/takes/song.webm");
    await write("/takes/song_processed.wav");
    await write("/takes/song_preview.wav");
    await write("/takes/song_preview_raw.wav");

    await unlinkTakeLocalFiles({ audioFileUrl: "/takes/song.webm", processedFileUrl: "/takes/song_processed.wav" });

    expect(await exists("/takes/song.webm")).toBe(false);
    expect(await exists("/takes/song_processed.wav")).toBe(false);
    expect(await exists("/takes/song_preview.wav")).toBe(false);
    expect(await exists("/takes/song_preview_raw.wav")).toBe(false);
  });

  it("only touches /takes/ paths and never throws on missing files", async () => {
    await write("/covers/keep.jpg");

    await expect(
      unlinkTakeLocalFiles([
        { audioFileUrl: "/covers/keep.jpg" },            // outside /takes/ → must be left alone
        { audioFileUrl: "/takes/does-not-exist.webm" },  // missing → must not throw
      ])
    ).resolves.toBeUndefined();

    expect(await exists("/covers/keep.jpg")).toBe(true);
    await rm(abs("/covers/keep.jpg"), { force: true });
  });

  it("accepts a single take or an array", async () => {
    await write("/takes/one.webm");
    await unlinkTakeLocalFiles({ audioFileUrl: "/takes/one.webm" });
    expect(await exists("/takes/one.webm")).toBe(false);
  });
});
