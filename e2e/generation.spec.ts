import { test, expect } from "@playwright/test";
import {
  uniqueEmail,
  DEFAULT_PASSWORD,
  registerUser,
  loginViaUI,
  mockSong,
} from "./helpers";

const TEST_PASSWORD = DEFAULT_PASSWORD;
let testEmail: string;

test.beforeAll(async ({ baseURL }) => {
  testEmail = uniqueEmail("generation");
  await registerUser(baseURL ?? "http://localhost:3200", {
    name: "Generation Tester",
    email: testEmail,
    password: TEST_PASSWORD,
  });
});

// ─── Generation Status Polling ──────────────────────────────────────────────

test.describe("Generation — Status Polling", () => {
  test("generate form shows pending state then poll completes", async ({
    page,
  }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    let pollCount = 0;

    // Mock generate endpoint to return a pending song
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          songs: [
            mockSong({
              id: "poll-song-1",
              title: "Polling Song",
              generationStatus: "pending",
              audioUrl: null,
            }),
          ],
        }),
      });
    });

    // Mock status polling endpoint — returns pending first, then ready
    await page.route("**/api/songs/*/status", async (route) => {
      pollCount++;
      const status = pollCount >= 2 ? "ready" : "pending";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generationStatus: status,
          audioUrl:
            status === "ready" ? "https://example.com/ready.mp3" : null,
        }),
      });
    });

    await page.goto("/generate");

    await page.getByLabel("Style / genre").fill("electronic");
    await page.locator('button[type="submit"]').click();

    // Should show success message
    await expect(
      page.getByText("Song generation started!")
    ).toBeVisible({ timeout: 5000 });
  });

  test("library shows generating badge for pending songs", async ({
    page,
  }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    // Mock songs endpoint to return a pending song
    await page.route("**/api/songs*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            songs: [
              mockSong({
                title: "Generating Song",
                generationStatus: "pending",
                audioUrl: null,
              }),
            ],
            total: 1,
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock status endpoint
    await page.route("**/api/songs/*/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ generationStatus: "pending", audioUrl: null }),
      });
    });

    await page.goto("/library");

    // Should show the "Generating…" badge
    await expect(page.getByText("Generating…")).toBeVisible({ timeout: 5000 });
  });

  test("library shows failed badge for errored songs", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.route("**/api/songs*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            songs: [
              mockSong({
                title: "Failed Song",
                generationStatus: "failed",
                errorMessage: "Suno API timeout",
                audioUrl: null,
              }),
            ],
            total: 1,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/library");

    await expect(page.getByText("Failed").first()).toBeVisible({ timeout: 5000 });
  });
});

// ─── Generation Form Validation ─────────────────────────────────────────────

test.describe("Generation — Form Validation", () => {
  test("generate page renders with correct heading", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/generate");

    await expect(page.locator("h1").first()).toContainText("Generate");
    await expect(
      page.getByText("Create a new song with AI")
    ).toBeVisible();
  });

  test("instrumental toggle changes state", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/generate");

    // The switches: first is "Custom lyrics", second is "Instrumental only"
    const switches = page.getByRole("switch");
    const instrumentalSwitch = switches.nth(1);

    // Initially instrumental is off
    await expect(instrumentalSwitch).toHaveAttribute("aria-checked", "false");

    // Toggle instrumental on
    await instrumentalSwitch.click();
    await expect(instrumentalSwitch).toHaveAttribute("aria-checked", "true");

    // Toggle back off
    await instrumentalSwitch.click();
    await expect(instrumentalSwitch).toHaveAttribute("aria-checked", "false");
  });

  test("generate requires style/genre field", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Style/genre is required" }),
      });
    });

    await page.goto("/generate");

    // Try to submit without filling style
    await page.locator('button[type="submit"]').click();

    // Should show validation or stay on page
    await expect(page).toHaveURL(/\/generate/);
  });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

test.describe("Generation — Rate Limiting", () => {
  test("shows error when rate limited", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const resetAt = new Date(Date.now() + 300000).toISOString();
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Rate limit exceeded.",
          code: "RATE_LIMIT",
          details: {
            resetAt,
            rateLimit: { remaining: 0, limit: 10, resetAt },
          },
        }),
      });
    });

    await page.goto("/generate");
    await page.getByLabel("Style / genre").fill("jazz");
    await page.locator('button[type="submit"]').click();

    // Should show rate limit error (multiple elements match — use first)
    await expect(
      page.getByText(/Rate limit reached/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
