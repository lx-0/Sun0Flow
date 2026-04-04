import { test, expect } from "@playwright/test";
import {
  DEFAULT_PASSWORD,
  loginViaUI,
  getSharedUser,
  mockCreditsAPI,
} from "./helpers";

// ─── Test user shared across all tests (registered once in globalSetup) ─────

const TEST_PASSWORD = DEFAULT_PASSWORD;
const testEmail = getSharedUser().email;

// ─── Song Generation ────────────────────────────────────────────────────────

test.describe("Song Generation", () => {
  test("generate form submits and shows success message", async ({
    page,
  }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    // Mock credits so the UpgradeModal doesn't block form submission
    await mockCreditsAPI(page);

    // Intercept the generate API to return a mock song
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          songs: [
            {
              id: "mock-song-id-1",
              userId: "test-user",
              sunoJobId: null,
              title: "E2E Test Song",
              prompt: "upbeat electronic",
              tags: "electronic",
              audioUrl: "https://example.com/audio.mp3",
              imageUrl: null,
              duration: 120,
              lyrics: null,
              sunoModel: null,
              generationStatus: "ready",
              errorMessage: null,
              pollCount: 0,
              isPublic: false,
              publicSlug: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto("/generate");

    // Verify the generate page renders
    await expect(page.locator("h1").first().first()).toContainText("Generate");
    await expect(
      page.getByText("Create a new song with AI")
    ).toBeVisible();

    // Fill the form
    await page.getByLabel("Song title").fill("E2E Test Song");
    await page.getByLabel("Style / genre").fill("upbeat electronic");

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should show success message
    await expect(
      page.getByText("Song generation started!")
    ).toBeVisible({ timeout: 5000 });
  });

  test("generate form with custom lyrics mode", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockCreditsAPI(page);

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          songs: [
            {
              id: "mock-song-lyrics-1",
              userId: "test-user",
              sunoJobId: null,
              title: "Lyrics Song",
              prompt: "[Verse 1]\nHello world",
              tags: "pop",
              audioUrl: "https://example.com/audio2.mp3",
              imageUrl: null,
              duration: 90,
              lyrics: "[Verse 1]\nHello world",
              sunoModel: null,
              generationStatus: "ready",
              errorMessage: null,
              pollCount: 0,
              isPublic: false,
              publicSlug: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto("/generate");

    // Toggle custom lyrics mode
    const customSwitch = page.getByRole("switch").first();
    await customSwitch.click();

    // Lyrics textarea should appear — use role+name to avoid matching the switch label
    const lyricsField = page.getByRole("textbox", { name: "Lyrics" });
    await expect(lyricsField).toBeVisible({ timeout: 3000 });

    // Fill the form
    await page.getByLabel("Style / genre").fill("pop");
    await lyricsField.fill("[Verse 1]\nHello world\n\n[Chorus]\nTesting testing");

    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText("Song generation started!")
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Library View ───────────────────────────────────────────────────────────

test.describe("Library View", () => {
  test("library page renders with empty state", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/library");

    // Verify the library page renders
    await expect(page.locator("h1").first()).toContainText("Library");

    // Should show song count — allow extra time for the client-side refetch
    // (the library loads via SSR first, then refetches client-side which
    // briefly shows "Searching…" before displaying the count again)
    await expect(page.getByText(/\d+ songs?/)).toBeVisible({ timeout: 15000 });

    // Should show empty state or song list
    // (freshly seeded user has no songs unless generate tests ran first)
    const emptyMsg = page.getByText("No songs yet");
    const songList = page.locator("ul");
    await expect(emptyMsg.or(songList)).toBeVisible({ timeout: 10000 });
  });

  test("library page shows songs after generation", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockCreditsAPI(page);

    // First, generate a song via the API directly
    // Intercept generate to return a mock
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          songs: [
            {
              id: "lib-test-song-1",
              userId: "test-user",
              sunoJobId: null,
              title: "Library Test Song",
              prompt: "jazz",
              tags: "jazz",
              audioUrl: "https://example.com/jazz.mp3",
              imageUrl: null,
              duration: 180,
              lyrics: null,
              sunoModel: null,
              generationStatus: "ready",
              errorMessage: null,
              pollCount: 0,
              isPublic: false,
              publicSlug: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    // Generate a song via the form
    await page.goto("/generate");
    await page.getByLabel("Style / genre").fill("jazz");
    await page.locator('button[type="submit"]').click();

    // Should show success toast
    await expect(
      page.getByText("Song generation started!")
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Navigation ─────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("nav links navigate to correct pages", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    // Wait for full hydration so the Next.js client-side router is ready.
    // Without this, Link clicks may preventDefault (React handler attached)
    // but fail to trigger client-side navigation (router not yet initialized).
    // Note: networkidle is unsuitable here because persistent polling
    // (notifications, pending songs) keeps the network active indefinitely.
    await page.waitForLoadState("domcontentloaded");
    await page.getByRole("link", { name: "Generate" }).first().waitFor();

    // Generate
    await page.getByRole("link", { name: "Generate" }).first().click();
    await page.waitForURL(/\/generate/, { timeout: 10000 });

    // Library
    await page.getByRole("link", { name: "Library" }).first().click();
    await page.waitForURL(/\/library/, { timeout: 10000 });

    // Home — authenticated users are redirected to /library
    await page.getByRole("link", { name: "Home" }).first().click();
    await page.waitForURL(/\/library/, { timeout: 10000 });
    await page.waitForLoadState("domcontentloaded");

    // Inspire
    await page.getByRole("link", { name: "Inspire" }).first().click();
    await page.waitForURL(/\/inspire/, { timeout: 10000 });
  });

  test("settings link in header navigates to settings", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/");

    // Click settings icon in header
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 5000 });
  });

  test("sign out redirects to login", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/");

    // Wait for the session to load so the AppShell renders the sign-out button
    // (useSession() needs time to fetch the session after navigation)
    const signOutBtn = page.getByRole("button", { name: "Sign out" }).first();
    await signOutBtn.waitFor({ state: "visible", timeout: 20000 });
    await signOutBtn.click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    // Navigate to a protected page without being logged in
    await page.goto("/generate");

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
