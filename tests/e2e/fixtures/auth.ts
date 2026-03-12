/**
 * Playwright auth fixture for E2E tests.
 *
 * Extends Playwright's `test` to automatically:
 *  1. Seed a test user + session via POST /api/test/seed
 *  2. Set the session cookie so all navigation is authenticated
 *
 * Usage:
 *   import { test, expect } from "./fixtures/auth";
 *
 *   test("my test", async ({ page, seedData }) => {
 *     // seedData.userId is always available
 *     // seedData.bookId / seedData.chapterIds available if seeded
 *   });
 */
import { test as base, expect } from "@playwright/test";

interface SeedData {
  userId: string;
  bookId: string | null;
  chapterIds: string[];
}

export const test = base.extend<{ seedData: SeedData }>({
  seedData: async ({ page }, use) => {
    // Default seed — just user + session, no content
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

    const data = await seedRes.json();
    await use(data as SeedData);
  },

  page: async ({ page, context }, use) => {
    // Set the session cookie matching what we seeded
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

/**
 * Helper: seed content data (book, chapters, takes) via the API.
 * Call this in test.beforeEach or at the start of a test.
 */
export async function seedContent(
  request: { post: (url: string, opts?: object) => Promise<any>; delete: (url: string) => Promise<any> },
  options: {
    book?: boolean;
    bookTitle?: string;
    bookAuthor?: string;
    chapters?: number;
    groupTitle?: string;
    take?: boolean;
  } = {}
): Promise<SeedData> {
  // Clear existing content first
  await request.delete("/api/test/seed");
  const res = await request.post("/api/test/seed", {
    data: options,
  });
  return (await res.json()) as SeedData;
}

export { expect } from "@playwright/test";
