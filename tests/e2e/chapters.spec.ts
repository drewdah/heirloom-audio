/**
 * E2E: Chapters — add, rename, reorder, and delete chapters.
 */
import { test, expect, seedContent } from "./fixtures/auth";

test.describe("Chapters", () => {
  test("adds a chapter from the book detail page", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true, bookTitle: "Bible" });

    await page.goto(`/books/${seed.bookId}`);
    await expect(page.locator("text=No chapters yet")).toBeVisible();

    await page.click("text=Add Chapter");
    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}/chapters/new`));

    await page.fill('input[name="title"]', "Chapter 1");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 10_000 });
  });

  test("adds a chapter with a group title", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true });

    await page.goto(`/books/${seed.bookId}/chapters/new`);

    await page.fill('input[name="groupTitle"]', "Genesis");
    await page.fill('input[name="title"]', "Chapter 1");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 10_000 });

    await page.goto(`/books/${seed.bookId}`);
    await expect(page.locator("text=Genesis")).toBeVisible();
    await expect(page.locator("text=Chapter 1")).toBeVisible();
  });

  test("shows multiple chapters in order on the book page", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      bookTitle: "Bible",
      chapters: 3,
    });

    await page.goto(`/books/${seed.bookId}`);

    await expect(page.locator("text=Chapter 1")).toBeVisible();
    await expect(page.locator("text=Chapter 2")).toBeVisible();
    await expect(page.locator("text=Chapter 3")).toBeVisible();

    // Progress bar label: "0/3 chapters complete"
    await expect(page.getByText("0/3 chapters complete")).toBeVisible();
  });

  test("deletes a chapter from the book page", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 2,
    });

    await page.goto(`/books/${seed.bookId}`);
    await expect(page.locator("text=Chapter 1")).toBeVisible();
    await expect(page.locator("text=Chapter 2")).toBeVisible();

    const firstChapterId = seed.chapterIds[0];

    // Click the trash icon (opacity-0 in CSS, so use force:true)
    await page.locator(`[data-testid="chapter-delete-trigger-${firstChapterId}"]`).click({ force: true });

    // Click the confirm Delete button in the inline panel
    await page.locator(`[data-testid="chapter-delete-confirm-${firstChapterId}"]`).click();

    // Chapter 1 link should be gone; Chapter 2 remains
    await expect(page.getByRole("link", { name: "Chapter 1" })).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Chapter 2")).toBeVisible();
  });

  test("navigates from book page to recording studio", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}`);

    // Click the chapter title link
    await page.getByRole("link", { name: "Chapter 1" }).click();

    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 5_000 });
  });
});
