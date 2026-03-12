/**
 * E2E: Recording Studio — navigate to studio, verify UI elements and navigation.
 *
 * Note: Real microphone recording cannot be automated in Playwright since it
 * requires getUserMedia. These tests verify the studio UI loads correctly,
 * shows the right chapter info, and navigation works.
 *
 * The "uploads an audio file" test has been removed — the studio uses a
 * click-to-record microphone interface with no file upload input.
 */
import { test, expect, seedContent } from "./fixtures/auth";

test.describe("Recording Studio", () => {
  test("shows the recording studio for a chapter", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);

    // Studio renders the chapter title in an <h1>
    await expect(page.getByRole("heading", { name: "Chapter 1" })).toBeVisible();

    // Record button is present in the transport/controls area
    await expect(page.getByRole("button", { name: /Record/i })).toBeVisible({ timeout: 5_000 });
  });

  test("shows chapter navigation (prev/next)", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 3,
    });

    // Navigate to the middle chapter (index 1)
    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[1]}`);

    // Studio nav shows "N of total" — middle of 3 = "2 of 3"
    await expect(page.locator("text=2 of 3")).toBeVisible();

    // Prev link goes to chapter 0, next link goes to chapter 2
    await expect(page.locator(`a[href*="/chapters/${seed.chapterIds[0]}"]`)).toBeVisible();
    await expect(page.locator(`a[href*="/chapters/${seed.chapterIds[2]}"]`)).toBeVisible();
  });

  test("navigates back to book page from studio", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "My Book",
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}/chapters/${seed.chapterIds[0]}`);

    // Back link in the studio nav points to the book page
    await page.click(`a[href="/books/${seed.bookId}"]`);

    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}`), { timeout: 5_000 });
    await expect(page.locator("h1")).toContainText("My Book");
  });
});
