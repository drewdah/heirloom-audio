import { describe, it, expect, afterEach } from "vitest";
import { writeFileAtomic } from "@/lib/atomic-file";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const created: string[] = [];
async function tmp() {
  const d = await mkdtemp(join(tmpdir(), "atomic-"));
  created.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(created.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("writeFileAtomic", () => {
  it("writes the exact bytes to the target path", async () => {
    const p = join(await tmp(), "take.webm");
    const data = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    await writeFileAtomic(p, data);
    expect(Buffer.compare(await readFile(p), data)).toBe(0);
  });

  it("creates missing parent directories", async () => {
    const p = join(await tmp(), "nested", "deep", "take.webm");
    await writeFileAtomic(p, Buffer.from("hi"));
    expect((await readFile(p)).toString()).toBe("hi");
  });

  it("overwrites an existing file with the new contents", async () => {
    const p = join(await tmp(), "take.webm");
    await writeFile(p, "old-content-that-is-longer");
    await writeFileAtomic(p, Buffer.from("new"));
    expect((await readFile(p)).toString()).toBe("new");
  });

  it("leaves no temp files behind on success", async () => {
    const d = await tmp();
    await writeFileAtomic(join(d, "take.webm"), Buffer.from("x"));
    const entries = await readdir(d);
    expect(entries).toEqual(["take.webm"]);
    expect(entries.some((e) => e.includes(".tmp"))).toBe(false);
  });
});
