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
    // EmptyShelf renders a "Record Your First Book" CTA — confirm a /books/new link exists in main
    await expect(page.locator('main a[href="/books/new"]').first()).toBeVisible();
  });

  test("creates a new book and shows it on the shelf", async ({ page }) => {
    await page.goto("/books/new");

    // BookForm uses controlled inputs — title is the first required text input
    await page.locator('input[type="text"][required]').first().fill("Genesis Recording");
    // Author is the second required text input
    await page.locator('input[type="text"][required]').nth(1).fill("Dad");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/books\/.+/, { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("Genesis Recording");

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

    const titleInput = page.locator('input[type="text"][required]').first();
    await titleInput.clear();
    await titleInput.fill("New Title");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(new RegExp(`/books/${seed.bookId}`), { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("New Title");
  });

  test("deletes a book from the detail page", async ({ page, request }) => {
    await seedContent(request, { book: true, bookTitle: "To Delete" });

    await page.goto("/shelf");
    await page.click("[data-book-id]");

    // Open the delete dialog
    await page.click("button:has-text('Delete')");

    // The dialog has an <h2>Delete Book</h2> and a <button>Delete Book</button>
    // Use getByRole to be unambiguous
    await expect(page.getByRole("heading", { name: "Delete Book" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Book" }).click();

    await expect(page).toHaveURL("/shelf", { timeout: 10_000 });
    await expect(page.locator("[data-book-id]")).toHaveCount(0, { timeout: 5_000 });
  });
});
