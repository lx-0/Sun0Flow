import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3200",
    trace: "on-first-retry",
    // Force English locale so next-intl never redirects to a locale-prefixed URL
    locale: "en-US",
  },
  // Increase default assertion timeout: first-time page compilation in dev can take >5s
  expect: { timeout: 15000 },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "NODE_ENV=development npm run dev -- --port 3200",
    url: process.env.BASE_URL ?? "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    // Allow 2 minutes for initial server startup + prisma migrations
    timeout: 120 * 1000,
    env: {
      // Signal to auth.ts to skip CSRF token validation (Auth.js official E2E pattern).
      // Only active when playwright starts the dev server; never set in production.
      PLAYWRIGHT_TEST: "true",
    },
  },
});
