/**
 * Screenshot capture script (dev only)
 *
 * Takes screenshots of all key pages with realistic seeded content and saves
 * them to docs/screenshots/. Use these to keep the README up to date.
 *
 * Requirements:
 *   - App running locally with ENABLE_TEST_SEED=true:
 *       docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build
 *
 * Usage:
 *   npm run screenshots
 */

import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots");

async function seed(baseURL: string, options: object = {}): Promise<{
  userId: string;
  bookId: string | null;
  chapterIds: string[];
}> {
  const { request } = await import("@playwright/test");
  // Use raw fetch since we're outside a test context
  await fetch(`${baseURL}/api/test/seed`, { method: "DELETE" });
  const res = await fetch(`${baseURL}/api/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) throw new Error(`Seed failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`📸  Capturing screenshots → ${OUT_DIR}`);
  console.log(`    App: ${BASE_URL}\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  // Inject auth cookie so every page is authenticated
  await context.addCookies([{
    name: "authjs.session-token",
    value: "test-session-token",
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);

  const page = await context.newPage();

  // ── Seed: empty shelf ──────────────────────────────────────────────────────
  await seed(BASE_URL);
  await page.goto(`${BASE_URL}/shelf`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "01-shelf-empty.png"), fullPage: false });
  console.log("  ✓ 01-shelf-empty.png");

  // ── Seed: shelf with books ─────────────────────────────────────────────────
  await seed(BASE_URL, { book: true, bookTitle: "The Holy Bible", bookAuthor: "Various Authors", chapters: 10, groupTitle: "Genesis" });
  // Seed a second book so the shelf looks populated
  await fetch(`${BASE_URL}/api/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book: true, bookTitle: "Mere Christianity", bookAuthor: "C.S. Lewis", chapters: 5 }),
  });

  await page.goto(`${BASE_URL}/shelf`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "02-shelf-with-books.png"), fullPage: false });
  console.log("  ✓ 02-shelf-with-books.png");

  // ── Seed: book detail ─────────────────────────────────────────────────────
  const { bookId, chapterIds } = await seed(BASE_URL, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 8,
    groupTitle: "Genesis",
  });

  await page.goto(`${BASE_URL}/books/${bookId}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "03-book-detail.png"), fullPage: true });
  console.log("  ✓ 03-book-detail.png");

  // ── Chapter recording studio ───────────────────────────────────────────────
  if (chapterIds.length > 0) {
    await page.goto(`${BASE_URL}/books/${bookId}/chapters/${chapterIds[0]}`);
    await page.waitForLoadState("networkidle");
    // Wait for the Record button to appear so the studio is fully rendered
    await page.waitForSelector("button", { timeout: 10_000 });
    await page.screenshot({ path: path.join(OUT_DIR, "04-recording-studio.png"), fullPage: true });
    console.log("  ✓ 04-recording-studio.png");
  }

  // ── Add chapter page ───────────────────────────────────────────────────────
  await page.goto(`${BASE_URL}/books/${bookId}/chapters/new`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(OUT_DIR, "05-add-chapter.png"), fullPage: true });
  console.log("  ✓ 05-add-chapter.png");

  await browser.close();
  console.log(`\n✅  Done. ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err.message);
  process.exit(1);
});
