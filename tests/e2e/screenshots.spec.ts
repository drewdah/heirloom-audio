/**
 * Screenshot capture spec.
 *
 * Visits key pages with realistic seeded content and saves screenshots
 * directly to .github/assets/ so the README stays up to date automatically.
 *
 * Excluded from the regular E2E run — use the dedicated npm script:
 *   npm run screenshots
 *
 * Requirements:
 *   App running with ENABLE_TEST_SEED=true:
 *     docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build
 */
import path from "path";
import { test } from "./fixtures/auth";
import { seedContent } from "./fixtures/auth";

const ASSETS = path.resolve(process.cwd(), ".github/assets");
const shot = (name: string) => path.join(ASSETS, name);

test.use({ viewport: { width: 1440, height: 900 } });

test("shelf with books", async ({ page, request }) => {
  await seedContent(request, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 10,
    groupTitle: "Genesis",
  });
  // Seed a second book so the shelf looks populated
  await request.post("/api/test/seed", {
    data: { book: true, bookTitle: "Mere Christianity", bookAuthor: "C.S. Lewis", chapters: 5 },
  });

  await page.goto("/shelf");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: shot("shelf-row.png"), fullPage: false });
});

test("book detail and chapters", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 8,
    groupTitle: "Genesis",
    completedChapters: 3,
  });

  await page.goto(`/books/${seed.bookId}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: shot("book-chapters.png"), fullPage: true });
});

test("new book form", async ({ page, request }) => {
  await seedContent(request);

  await page.goto("/books/new");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: shot("add-book.png"), fullPage: true });
});

test("recording studio", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 3,
    groupTitle: "Genesis",
  });

  await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("button", { timeout: 10_000 });
  await page.screenshot({ path: shot("chapter-recording.png"), fullPage: true });
});

test("recording studio with transcription", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 1,
    take: true,
  });

  await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: shot("chapter-recording-transcription.png"), fullPage: true });
});

test("audio settings modal", async ({ page, request }) => {
  await seedContent(request);

  await page.goto("/shelf");
  await page.waitForLoadState("networkidle");
  await page.click('button[title="Audio settings"]');
  await page.waitForSelector("text=Audio Settings", { timeout: 5_000 });
  await page.screenshot({ path: shot("audio-settings.png"), fullPage: false });
});

test("export modal", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Holy Bible",
    bookAuthor: "Various Authors",
    chapters: 3,
    completedChapters: 3,
  });

  await page.goto(`/books/${seed.bookId}`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Export")');
  await page.waitForSelector("text=Export Audiobook", { timeout: 5_000 });
  await page.screenshot({ path: shot("export-modal.png"), fullPage: false });
});
