/**
 * Playwright auth fixture for E2E tests.
 *
 * Extends Playwright's `test` to automatically:
 *  1. Seed a test user + session via POST /api/test/seed
 *  2. Set the session cookie so all navigation is authenticated
 *
 * IMPORTANT: The app must be running with ENABLE_TEST_SEED=true for the
 * seed endpoint to be available. Start Docker with:
 *   docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build
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

const SEED_ERROR_MSG =
  "The /api/test/seed endpoint is not available. " +
  "Make sure the app is running with the CI override (sets ENABLE_TEST_SEED=true):\n\n" +
  "  docker compose down\n" +
  "  docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build\n";

async function parseSeedResponse(res: { status: () => number; text: () => Promise<string> }): Promise<SeedData> {
  const status = res.status();

  if (status === 404) {
    throw new Error(SEED_ERROR_MSG);
  }

  const text = await res.text();

  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(SEED_ERROR_MSG);
  }

  if (status >= 400) {
    throw new Error(`Seed endpoint failed (${status}): ${text}`);
  }

  return JSON.parse(text) as SeedData;
}

export const test = base.extend<{ seedData: SeedData }>({
  seedData: async ({ page }, use) => {
    const seedRes = await page.request.post("/api/test/seed");
    const data = await parseSeedResponse(seedRes);
    await use(data);
  },

  page: async ({ page, context }, use) => {
    // NextAuth v5 (@auth/core) uses "authjs.session-token" on HTTP (no __Secure- prefix).
    // NextAuth v4 used "next-auth.session-token" — v5 renamed all cookies to authjs.*
    await context.addCookies([
      {
        name: "authjs.session-token",
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
    completedChapters?: number;
    groupTitle?: string;
    take?: boolean;
  } = {}
): Promise<SeedData> {
  await request.delete("/api/test/seed");
  const res = await request.post("/api/test/seed", {
    data: options,
  });
  return parseSeedResponse(res);
}

export { expect } from "@playwright/test";
