import { prisma } from "@/lib/prisma";
import { uploadAudioToDrive } from "@/lib/google-drive";
import { readFile } from "fs/promises";
import { join } from "path";

const MIME_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

export interface BackupOptions {
  /** Number of upload attempts before giving up. */
  maxAttempts?: number;
  /** Base delay between retries (grows linearly per attempt). */
  delayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Back up a take's ORIGINAL recording to Google Drive, tracking progress on the
 * take row (backupStatus: pending → uploading → backed_up | failed).
 *
 * Idempotent: a take that already has a Drive file is left as backed_up and not
 * re-uploaded. Safe to call on create and again from the retry endpoint. Errors
 * are recorded on the take (backupError) rather than thrown, so callers can run
 * it fire-and-forget without unhandled rejections.
 */
export async function backupTake(takeId: string, opts: BackupOptions = {}): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const delayMs = opts.delayMs ?? 1000;

  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { chapter: { include: { book: true } } },
  });
  if (!take) return;

  // Already backed up — reconcile status and stop (idempotent).
  if (take.audioDriveId) {
    if (take.backupStatus !== "backed_up") {
      await prisma.take.update({
        where: { id: takeId },
        data: { backupStatus: "backed_up", backupError: null },
      });
    }
    return;
  }

  if (!take.audioFileUrl) {
    await prisma.take.update({
      where: { id: takeId },
      data: { backupStatus: "failed", backupError: "No local file to back up" },
    });
    return;
  }

  const ext = take.audioFileUrl.split(".").pop()?.toLowerCase() || "webm";
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const localPath = join(process.cwd(), "public", take.audioFileUrl.replace(/^\//, ""));

  // Read the original off disk. If it's missing, this is a restore concern
  // (tracked separately) — record the failure so it's visible and retryable.
  let buffer: Buffer;
  try {
    buffer = await readFile(localPath);
  } catch (err) {
    await prisma.take.update({
      where: { id: takeId },
      data: { backupStatus: "failed", backupError: `Local file unavailable: ${errMessage(err)}` },
    });
    return;
  }

  // Human-friendly, stable Drive filename: <order>-<slug>-take<n>.<ext>
  const takeNumber = await prisma.take.count({
    where: { chapterId: take.chapterId, createdAt: { lte: take.createdAt } },
  });
  const orderStr = String(take.chapter.order).padStart(2, "0");
  const slug = take.chapter.title.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
  const driveName = `${orderStr}-${slug}-take${takeNumber}.${ext}`;

  await prisma.take.update({ where: { id: takeId }, data: { backupStatus: "uploading" } });

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { fileId } = await uploadAudioToDrive(
        take.chapter.book.userId,
        take.chapter.bookId,
        driveName,
        buffer,
        mimeType
      );
      await prisma.take.update({
        where: { id: takeId },
        data: { audioDriveId: fileId, backupStatus: "backed_up", backupError: null },
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) await sleep(delayMs * attempt);
    }
  }

  await prisma.take.update({
    where: { id: takeId },
    data: { backupStatus: "failed", backupError: errMessage(lastError) },
  });
}

/**
 * Fire-and-forget backup: runs in the background and never rejects, so request
 * handlers can trigger it without awaiting or risking an unhandled rejection.
 */
export function backupTakeInBackground(takeId: string, opts?: BackupOptions): void {
  void backupTake(takeId, opts).catch((err) =>
    console.error(`[take-backup] unexpected error for ${takeId}:`, err)
  );
}
