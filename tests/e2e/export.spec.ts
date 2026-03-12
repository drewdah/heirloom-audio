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

    // Export M4B button should be visible in BookActions
    await expect(page.locator("button:has-text('Export M4B')")).toBeVisible();
  });

  test("export modal shows incomplete chapter warnings", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 2,
    });

    await page.goto(`/books/${seed.bookId}`);

    // Click Export M4B to open the modal
    await page.click("button:has-text('Export M4B')");

    // The modal should appear and warn about incomplete chapters
    // since none of the seeded chapters have recordingComplete=true
    await expect(
      page.locator("text=incomplete").or(
        page.locator("text=not complete").or(
          page.locator("text=not ready").or(
            page.locator("text=complete all")
          )
        )
      )
    ).toBeVisible({ timeout: 5_000 });
  });

  test("export modal can be closed", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}`);
    await page.click("button:has-text('Export M4B')");

    // Modal should be visible
    await expect(page.locator("text=Export")).toBeVisible();

    // Close it (look for close button or clicking outside)
    const closeBtn = page.locator("button:has-text('Close')").or(
      page.locator("button:has-text('Cancel')").or(
        page.locator("button").filter({ has: page.locator("svg.lucide-x") })
      )
    );
    await closeBtn.first().click();

    // Modal should disappear
    await expect(page.locator("[role='dialog']").or(
      page.locator("div").filter({ hasText: "Export" }).locator("visible=true")
    )).not.toBeVisible({ timeout: 3_000 });
  });
});
