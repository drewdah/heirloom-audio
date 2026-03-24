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
 *   App running with ENABLE_TEST_SEED=true (handled automatically by the
 *   webServer config in playwright.screenshots.config.ts).
 */
import fs from "fs";
import path from "path";
import { test } from "./fixtures/auth";
import { seedContent } from "./fixtures/auth";

const ASSETS = path.resolve(process.cwd(), ".github/assets");
const shot = (name: string) => path.join(ASSETS, name);

test.use({ viewport: { width: 1440, height: 1080 } });

const COVERS_DIR = path.resolve(process.cwd(), "tests/e2e/fixtures/covers");

/** Read a locally stored cover image and return it as a data URI. */
function coverDataUri(filename: string): string {
  const data = fs.readFileSync(path.join(COVERS_DIR, filename));
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

/**
 * Pin fixed bottom status bars to the absolute bottom of the full page, and
 * hide the Next.js dev-mode indicator that appears in the bottom-left corner.
 *
 * Playwright's fullPage:true expands the canvas but position:fixed elements
 * stay frozen at their original viewport position, landing mid-screenshot.
 * Switching them to position:absolute keeps them at the real page bottom.
 */
async function prepareScreenshot(page: import("@playwright/test").Page) {
  // Wait for all images (e.g. cover art from Open Library) to finish loading
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.querySelectorAll("img")).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve());
              img.addEventListener("error", () => resolve());
            })
      )
    )
  );
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>(".fixed.bottom-0.left-0.right-0").forEach((el) => {
      el.style.position = "absolute";
      el.style.bottom = "0";
    });
  });
}

/** Public domain classics used across screenshot tests. */
const BOOKS = [
  { bookTitle: "Dracula",                          bookAuthor: "Bram Stoker",        chapters: 12, cover: "dracula.jpg"                   },
  { bookTitle: "Adventures of Huckleberry Finn",   bookAuthor: "Mark Twain",         chapters: 8,  cover: "huckleberry-finn.jpg"           },
  { bookTitle: "The Hound of the Baskervilles",    bookAuthor: "Arthur Conan Doyle", chapters: 10, cover: "hound-of-the-baskervilles.jpg"  },
  { bookTitle: "The Call of the Wild",             bookAuthor: "Jack London",        chapters: 7,  cover: "call-of-the-wild.jpg"           },
  { bookTitle: "The Time Machine",                 bookAuthor: "H.G. Wells",         chapters: 6,  cover: "the-time-machine.jpg"           },
] as const;

test("shelf with books", async ({ page, request }) => {
  // Seed first book (also resets DB and creates test user/session)
  await seedContent(request, { book: true, ...BOOKS[0], coverImageUrl: coverDataUri(BOOKS[0].cover) });

  // Add remaining books
  for (let i = 1; i < BOOKS.length; i++) {
    await request.post("/api/test/seed", {
      data: { book: true, ...BOOKS[i], coverImageUrl: coverDataUri(BOOKS[i].cover) },
    });
  }

  await page.goto("/shelf");
  await page.waitForLoadState("networkidle");
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("shelf-row.png"), fullPage: false });
});

test("book detail and chapters", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "Dracula",
    bookAuthor: "Bram Stoker",
    chapters: 8,
    groupTitle: "Part One",
    completedChapters: 3,
    coverImageUrl: coverDataUri("dracula.jpg"),
  });

  await page.goto(`/books/${seed.bookId}`);
  await page.waitForLoadState("networkidle");
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("book-chapters.png"), fullPage: true });
});

test("new book form", async ({ page, request }) => {
  await seedContent(request);

  await page.goto("/books/new");
  await page.waitForLoadState("networkidle");
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("add-book.png"), fullPage: true });
});

test("recording studio", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Hound of the Baskervilles",
    bookAuthor: "Arthur Conan Doyle",
    chapters: 3,
    groupTitle: "Part One",
    coverImageUrl: coverDataUri("hound-of-the-baskervilles.jpg"),
  });

  await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("button", { timeout: 10_000 });
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("chapter-recording.png"), fullPage: true });
});

test("recording studio with transcription", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "Adventures of Huckleberry Finn",
    bookAuthor: "Mark Twain",
    chapters: 1,
    take: true,
    coverImageUrl: coverDataUri("huckleberry-finn.jpg"),
  });

  await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);
  await page.waitForLoadState("networkidle");
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("chapter-recording-transcription.png"), fullPage: true });
});

test("audio settings modal", async ({ page, request }) => {
  await seedContent(request);

  await page.goto("/shelf");
  await page.waitForLoadState("networkidle");
  await page.click('button[title="Audio settings"]');
  await page.waitForSelector("text=Audio Settings", { timeout: 5_000 });
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("audio-settings.png"), fullPage: false });
});

test("export modal", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Call of the Wild",
    bookAuthor: "Jack London",
    chapters: 3,
    completedChapters: 3,
    coverImageUrl: coverDataUri("call-of-the-wild.jpg"),
  });

  await page.goto(`/books/${seed.bookId}`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Export")');
  await page.waitForSelector("text=Export Audiobook", { timeout: 5_000 });
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("export-modal.png"), fullPage: false });
});

test("export complete", async ({ page, request }) => {
  const seed = await seedContent(request, {
    book: true,
    bookTitle: "The Call of the Wild",
    bookAuthor: "Jack London",
    chapters: 3,
    completedChapters: 3,
    processedChapters: 3,
    coverImageUrl: coverDataUri("call-of-the-wild.jpg"),
  });

  // Intercept the export API so the modal jumps straight to the "done" state
  // without needing a real FFmpeg worker running.
  await page.route(`/api/books/${seed.bookId}/export`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { exportId: "mock-export-id", status: "queued" } });
    } else {
      await route.fulfill({
        json: {
          latestExport: {
            id: "mock-export-id",
            exportStatus: "done",
            exportFileUrl: null,
            fileSizeBytes: 47_185_920,
            versionTag: "v1-2026-03-24",
          },
        },
      });
    }
  });

  await page.goto(`/books/${seed.bookId}`);
  await page.waitForLoadState("networkidle");
  await page.click('button:has-text("Export")');
  await page.waitForSelector("text=Export Audiobook", { timeout: 5_000 });
  // Start the export — modal transitions to "exporting" then polls → "done"
  // Use last() since the header also has an "Export M4B" button
  await page.locator('button:has-text("Export M4B")').last().click();
  await page.waitForSelector("text=Export complete!", { timeout: 10_000 });
  await prepareScreenshot(page);
  await page.screenshot({ path: shot("export-complete.png"), fullPage: false });
});
