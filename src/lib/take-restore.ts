import { downloadDriveFile } from "@/lib/google-drive";
import { writeFileAtomic } from "@/lib/atomic-file";
import { access } from "fs/promises";
import { join } from "path";

/** Absolute local path for a take's `/takes/<file>` URL. */
export function localPathForUrl(audioFileUrl: string): string {
  return join(process.cwd(), "public", audioFileUrl.replace(/^\//, ""));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface RestorableTake {
  id: string;
  audioFileUrl: string | null;
  audioDriveId: string | null;
}

/**
 * Ensure a take's ORIGINAL recording is present on local disk, restoring it
 * from Google Drive (by audioDriveId) when the local copy is missing.
 *
 * This is what makes "re-process from the untouched original later" survive a
 * lost/rebuilt server disk: the worker only reads local files, so before we
 * hand it work we pull any missing original back down from its Drive backup.
 *
 * Returns whether the original ended up available locally, and whether a
 * restore actually happened (for logging).
 */
export async function ensureLocalOriginal(
  take: RestorableTake,
  userId: string
): Promise<{ available: boolean; restored: boolean }> {
  if (!take.audioFileUrl) return { available: false, restored: false };

  const localPath = localPathForUrl(take.audioFileUrl);
  if (await fileExists(localPath)) return { available: true, restored: false };

  // Local copy is gone — restore from Drive if we have a backup to restore from.
  if (!take.audioDriveId) return { available: false, restored: false };

  const buffer = await downloadDriveFile(userId, take.audioDriveId);
  await writeFileAtomic(localPath, buffer);
  return { available: true, restored: true };
}

/**
 * Restore any missing originals for a batch of takes. Returns the takes whose
 * originals are available locally afterward (safe to hand to the worker) and
 * how many were restored from Drive. A single take that can't be restored is
 * logged and dropped rather than failing the whole batch.
 */
export async function ensureOriginalsLocal<T extends RestorableTake>(
  takes: T[],
  userId: string
): Promise<{ available: T[]; restoredCount: number }> {
  const available: T[] = [];
  let restoredCount = 0;

  for (const take of takes) {
    try {
      const { available: ok, restored } = await ensureLocalOriginal(take, userId);
      if (restored) restoredCount++;
      if (ok) available.push(take);
    } catch (err) {
      console.error(`[take-restore] failed to restore original for take ${take.id}:`, err);
    }
  }

  return { available, restoredCount };
}
