import { test, expect } from "./fixtures/auth";

test.describe("Bookshelf", () => {
  test.beforeEach(async ({ request }) => {
    await request.delete("/api/test/seed");
    await request.post("/api/test/seed");
  });

  test("creates a new book and shows it on the shelf", async ({ page }) => {
    await page.goto("/shelf");
    await page.click('a[href="/books/new"]');
    await expect(page).toHaveURL("/books/new");

    await page.fill('input[type="text"][required]:first-of-type', "Genesis Recording");
    await page.fill('input[placeholder*="Anonymous"]', "Dad");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/books\/.+/, { timeout: 10_000 });
    await expect(page.locator("h1")).toContainText("Genesis Recording");

    await page.goto("/shelf");
    await expect(page.locator("[data-book-id]")).toHaveCount(1, { timeout: 5_000 });
  });
});
