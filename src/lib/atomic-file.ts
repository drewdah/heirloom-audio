import { open, mkdir, rename, unlink, stat } from "fs/promises";
import { dirname, join, basename } from "path";
import { randomUUID } from "crypto";

/**
 * Write `data` to `finalPath` atomically and durably.
 *
 * A reader either sees the complete file or no file at all: the bytes are
 * written to a temp file in the same directory, fsync'd to disk, then renamed
 * into place (rename is atomic within a filesystem). The on-disk size is
 * verified against the input to catch short writes. On any failure the temp
 * file is cleaned up and the error is rethrown.
 *
 * Callers MUST treat a throw as "nothing was durably written to finalPath"
 * and avoid recording that the file exists.
 */
export async function writeFileAtomic(finalPath: string, data: Buffer): Promise<void> {
  const dir = dirname(finalPath);
  await mkdir(dir, { recursive: true });

  // Temp file lives in the same directory so the rename stays on one filesystem.
  const tmpPath = join(dir, `.${basename(finalPath)}.${randomUUID()}.tmp`);

  const handle = await open(tmpPath, "w");
  try {
    await handle.writeFile(data);
    await handle.sync(); // fsync: flush bytes to disk before the rename exposes them
  } finally {
    await handle.close();
  }

  try {
    await rename(tmpPath, finalPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }

  // Best-effort fsync of the directory so the rename itself survives a crash.
  // Not supported on every platform (e.g. Windows), hence swallowed.
  try {
    const dirHandle = await open(dir, "r");
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    /* directory fsync unsupported here; the file fsync above still holds */
  }

  // Verify the persisted file is the full size we intended to write.
  const { size } = await stat(finalPath);
  if (size !== data.length) {
    await unlink(finalPath).catch(() => {});
    throw new Error(
      `atomic write size mismatch for ${finalPath}: persisted ${size} of ${data.length} bytes`
    );
  }
}
