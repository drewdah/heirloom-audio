import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for screenshot capture only.
 * Run via: npm run screenshots
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/screenshots.spec.ts",
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  workers: 1,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
