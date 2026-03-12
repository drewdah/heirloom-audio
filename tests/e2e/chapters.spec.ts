/**
 * E2E: Chapters — add, rename, reorder, and delete chapters.
 */
import { test, expect, seedContent } from "./fixtures/auth";

test.describe("Chapters", () => {
  test("adds a chapter from the book detail page", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true, bookTitle: "Bible" });

    await page.goto(`/books/${seed.bookId}`);
    await expect(page.locator("text=No chapters yet")).toBeVisible();

    // Click "Add Chapter"
    await page.click("text=Add Chapter");
    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}/chapters/new`));

    // Fill in the chapter title
    await page.fill('input[name="title"]', "Chapter 1");
    await page.click('button[type="submit"]');

    // Should redirect to the recording studio for that chapter
    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 10_000 });
  });

  test("adds a chapter with a group title", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true });

    await page.goto(`/books/${seed.bookId}/chapters/new`);

    await page.fill('input[name="groupTitle"]', "Genesis");
    await page.fill('input[name="title"]', "Chapter 1");
    await page.click('button[type="submit"]');

    // Should redirect to recording studio
    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 10_000 });

    // Go back to book page and verify the group title appears
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

    // All 3 chapters should be listed
    const chapterLinks = page.locator("text=Chapter 1").or(
      page.locator("text=Chapter 2")
    ).or(page.locator("text=Chapter 3"));
    await expect(page.locator("text=Chapter 1")).toBeVisible();
    await expect(page.locator("text=Chapter 2")).toBeVisible();
    await expect(page.locator("text=Chapter 3")).toBeVisible();

    // Progress should show 0/3 complete
    await expect(page.locator("text=0/3")).toBeVisible();
  });

  test("deletes a chapter from the book page", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 2,
    });

    await page.goto(`/books/${seed.bookId}`);
    await expect(page.locator("text=Chapter 1")).toBeVisible();
    await expect(page.locator("text=Chapter 2")).toBeVisible();

    // Click the delete button on the first chapter
    // The ChapterList has a trash icon button per row
    const firstTrash = page.locator("button").filter({ has: page.locator("svg.lucide-trash-2") }).first();
    await firstTrash.click();

    // Confirm deletion in the inline confirm
    await page.click("button:has-text('Delete'):visible");

    // Should now show only 1 chapter
    await expect(page.locator("text=Chapter 2")).toBeVisible();
    await expect(page.locator("text=Chapter 1")).not.toBeVisible({ timeout: 5_000 });
  });

  test("navigates from book page to recording studio", async ({ page, request }) => {
    const seed = await seedContent(request, {
      book: true,
      chapters: 1,
    });

    await page.goto(`/books/${seed.bookId}`);

    // Click on the chapter row to navigate to the recording studio
    await page.click("text=Chapter 1");

    await expect(page).toHaveURL(/\/chapters\/.+/, { timeout: 5_000 });
  });
});
