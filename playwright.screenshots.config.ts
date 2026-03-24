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
    baseURL: "http://localhost:3001",
    viewport: { width: 1440, height: 900 },
    trace: "off",
    screenshot: "off",
    video: "off",
  },

  webServer: {
    command: "ENABLE_TEST_SEED=true next dev --turbopack -H 0.0.0.0 --port 3001",
    url: "http://localhost:3001",
    reuseExistingServer: false,
    timeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
