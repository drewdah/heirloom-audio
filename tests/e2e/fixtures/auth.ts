import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page, context }, use) => {
    const seedRes = await page.request.post("/api/test/seed");

    if (seedRes.status() === 404) {
      throw new Error(
        "Test seed endpoint returned 404. Is NODE_ENV=test? " +
        "Make sure you're using docker-compose.ci.yml or have NODE_ENV=test set."
      );
    }

    if (!seedRes.ok()) {
      const body = await seedRes.text();
      throw new Error(`Seed endpoint failed (${seedRes.status()}): ${body}`);
    }

    await context.addCookies([
      {
        name: "next-auth.session-token",
        value: "test-session-token",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await use(page);
  },
});

export { expect } from "@playwright/test";
