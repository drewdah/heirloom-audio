import { unlink } from "fs/promises";
import { join } from "path";

type TakeFiles = { audioFileUrl?: string | null; processedFileUrl?: string | null };

/**
 * Best-effort removal of a take's local files under public/takes/: the original
 * recording, its processed WAV, and the A/B preview snippets. The durable Drive
 * copies are handled separately by the delete routes. Never throws — a missing
 * file or unlink error is ignored, since this is best-effort disk cleanup on
 * delete (the DB rows are the source of truth for what still exists).
 *
 * Only paths under /takes/ are touched, so a stray value can't unlink elsewhere.
 */
export async function unlinkTakeLocalFiles(takes: TakeFiles | TakeFiles[]): Promise<void> {
  const list = Array.isArray(takes) ? takes : [takes];
  const urls = new Set<string>();
  const add = (u?: string | null) => {
    if (u && u.startsWith("/takes/")) urls.add(u);
  };

  for (const t of list) {
    add(t.audioFileUrl);
    add(t.processedFileUrl);
    // Derive the processed + preview artifacts from the original's stem, in case
    // their URLs aren't stored on the row (previews never are).
    if (t.audioFileUrl?.startsWith("/takes/")) {
      const stem = t.audioFileUrl.replace(/\.[^./]+$/, "");
      add(`${stem}_processed.wav`);
      add(`${stem}_preview.wav`);
      add(`${stem}_preview_raw.wav`);
    }
  }

  await Promise.all(
    [...urls].map((u) => unlink(join(process.cwd(), "public", u.replace(/^\//, ""))).catch(() => {}))
  );
}
