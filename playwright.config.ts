import { defineConfig, devices } from "@playwright/test";

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? "3200");
const baseURL = process.env.BASE_URL ?? `http://localhost:${playwrightPort}`;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Force English locale so next-intl never redirects to a locale-prefixed URL
    locale: "en-US",
    // Block service workers so page.route() can intercept API requests.
    // The app's SW uses stale-while-revalidate for /api/songs, which bypasses
    // Playwright route mocking and causes mock-dependent tests to fail.
    serviceWorkers: "block",
  },
  // Increase default assertion timeout: first-time page compilation in dev can take >5s
  expect: { timeout: 15000 },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
      },
    },
  ],
  // Skip local server when PLAYWRIGHT_REMOTE=true (e.g. running E2E against a deployed staging env).
  // In that case BASE_URL must point to the remote service.
  webServer: process.env.PLAYWRIGHT_REMOTE
    ? undefined
    : {
        command: `PLAYWRIGHT_TEST=true NODE_ENV=development PORT=${playwrightPort} pnpm dev`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // Allow 2 minutes for initial server startup + prisma migrations
        timeout: 120 * 1000,
      },
});
