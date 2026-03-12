/**
 * E2E: Bookshelf — create, view, edit, and delete books.
 */
import { test, expect, seedContent } from "./fixtures/auth";

test.describe("Bookshelf", () => {
  test.beforeEach(async ({ request }) => {
    await seedContent(request);
  });

  test("shows empty shelf for new user", async ({ page }) => {
    await page.goto("/shelf");
    await expect(page.locator("h1")).toContainText("Your Bookshelf");
    // Empty state should show some kind of prompt to create a book
    await expect(page.locator("text=New Book").or(page.locator('a[href="/books/new"]'))).toBeVisible();
  });

  test("creates a new book and shows it on the shelf", async ({ page }) => {
    await page.goto("/shelf");

    // Click through to the new book form
    await page.click('a[href="/books/new"]');
    await expect(page).toHaveURL("/books/new");

    // Fill in required fields
    await page.fill('input[type="text"][required]:first-of-type', "Genesis Recording");
    await page.fill('input[placeholder*="Anonymous"]', "Dad");

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to the new book's page
    await expect(page).toHaveURL(/\/books\/.+/, { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("Genesis Recording");

    // Navigate back to shelf — book should appear
    await page.goto("/shelf");
    await expect(page.locator("[data-book-id]")).toHaveCount(1, { timeout: 5_000 });
  });

  test("navigates from shelf to book detail page", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true, bookTitle: "The Hobbit" });

    await page.goto("/shelf");
    await page.click("[data-book-id]");

    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}`));
    await expect(page.locator("h1")).toContainText("The Hobbit");
  });

  test("edits a book title", async ({ page, request }) => {
    const seed = await seedContent(request, { book: true, bookTitle: "Old Title" });

    await page.goto(`/books/${seed.bookId}/edit`);
    await expect(page.locator("h1")).toContainText("Edit Book");

    // Clear and type new title
    const titleInput = page.locator('input[type="text"][required]:first-of-type');
    await titleInput.clear();
    await titleInput.fill("New Title");
    await page.click('button[type="submit"]');

    // Should redirect back to book page with updated title
    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}`), { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("New Title");
  });

  test("deletes a book from the detail page", async ({ page, request }) => {
    await seedContent(request, { book: true, bookTitle: "To Delete" });

    await page.goto("/shelf");
    await page.click("[data-book-id]");

    // Click the Delete button in BookActions
    await page.click("button:has-text('Delete')");

    // Delete dialog should appear
    await expect(page.locator("text=Delete Book")).toBeVisible();

    // Confirm deletion
    await page.click("button:has-text('Delete'):not(:has-text('Cancel'))");

    // Should redirect to shelf
    await expect(page).toHaveURL("/shelf", { timeout: 10_000 });

    // Shelf should be empty
    await expect(page.locator("[data-book-id]")).toHaveCount(0, { timeout: 5_000 });
  });
});
