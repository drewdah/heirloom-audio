/**
 * E2E: Export flow — verify the export button and validation behavior.
 *
 * Full M4B export requires the whisper worker + FFmpeg pipeline,
 * which is disabled in CI. These tests verify the UI flow up to
 * the point where the export job would be queued.
 */
import { test, expect, seedContent } from "./fixtures/auth";

test.describe("Export", () => {
  test("shows export button on book detail page", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 2,
    });

    await page.goto(`/books/${seed.bookId}`);

    // Export M4B button is in BookActions
    await expect(page.locator("button:has-text('Export M4B')")).toBeVisible();
  });

  test("export modal shows incomplete chapter warnings", async ({ page, request }) => {
    // 1 completed chapter enables the button; 1 incomplete triggers the warning in the modal
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 2,
      completedChapters: 1,
    });

    await page.goto(`/books/${seed.bookId}`);
    await page.click("button:has-text('Export M4B')");

    // Modal appears — the blocked warning shows "Export blocked — chapters not ready"
    await expect(page.locator("text=Export blocked")).toBeVisible({ timeout: 5_000 });
  });

  test("export modal can be closed", async ({ page, request }) => {
    // Need at least one completed chapter so the Export button is enabled
    const seed = await seedContent(request, {
      book: true,
      chapters: 1,
      completedChapters: 1,
    });

    await page.goto(`/books/${seed.bookId}`);
    await page.click("button:has-text('Export M4B')");

    // Modal header should be visible
    await expect(page.locator("text=Export Audiobook")).toBeVisible();

    // Close via the Cancel button in the footer (review step)
    await page.click("button:has-text('Cancel')");

    // Modal should be gone
    await expect(page.locator("text=Export Audiobook")).not.toBeVisible({ timeout: 3_000 });
  });
});
