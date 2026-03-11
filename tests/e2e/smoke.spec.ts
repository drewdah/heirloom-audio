import { test, expect } from "@playwright/test";

test.describe("App Health", () => {
  test("health endpoint returns OK", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
  });

  test("unauthenticated user is redirected to signin", async ({ page }) => {
    await page.goto("/shelf");
    await expect(page).toHaveURL(/\/auth\/signin|\/api\/auth/);
  });
});
