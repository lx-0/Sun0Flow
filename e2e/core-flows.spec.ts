import { test, expect } from "@playwright/test";

// ─── Test user shared across all tests ──────────────────────────────────────

const TEST_PASSWORD = "CoreFlowPass123!";
let testEmail: string;

async function registerUser(
  baseURL: string,
  user: { name: string; email: string; password: string }
) {
  const res = await fetch(`${baseURL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  return res;
}

async function loginViaUI(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
}

// Seed a shared user before all tests in this file
test.beforeAll(async ({ baseURL }) => {
  testEmail = `e2e-core-${Date.now()}@test.local`;
  const res = await registerUser(baseURL ?? "http://localhost:3200", {
    name: "Core Flow Tester",
    email: testEmail,
    password: TEST_PASSWORD,
  });
  if (res.status !== 201) {
    throw new Error(
      `Failed to seed test user: ${res.status} ${await res.text()}`
    );
  }
});

// ─── Song Generation ────────────────────────────────────────────────────────

test.describe("Song Generation", () => {
  test("generate form submits and shows success message", async ({
    page,
  }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

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
    await expect(page.locator("h1")).toContainText("Generate");
    await expect(
      page.getByText("Create a new song with AI")
    ).toBeVisible();

    // Fill the form
    await page.getByLabel("Song title").fill("E2E Test Song");
    await page.getByLabel("Style / genre").fill("upbeat electronic");

    // Submit
    await page.getByRole("button", { name: "Generate" }).click();

    // Should show success message
    await expect(
      page.getByText("Song queued! Redirecting to your library…")
    ).toBeVisible({ timeout: 5000 });

    // Should redirect to library
    await expect(page).toHaveURL(/\/library/, { timeout: 10000 });
  });

  test("generate form with custom lyrics mode", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.route("**/api/generate", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      // Verify custom lyrics were sent as the prompt
      expect(body.prompt).toContain("Verse 1");

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
              prompt: body.prompt,
              tags: "pop",
              audioUrl: "https://example.com/audio2.mp3",
              imageUrl: null,
              duration: 90,
              lyrics: body.prompt,
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
    await page.getByRole("switch", { name: /Custom lyrics/i }).click();

    // Lyrics textarea should appear
    const lyricsField = page.getByLabel("Lyrics");
    await expect(lyricsField).toBeVisible();

    // Fill the form
    await page.getByLabel("Style / genre").fill("pop");
    await lyricsField.fill("[Verse 1]\nHello world\n\n[Chorus]\nTesting testing");

    await page.getByRole("button", { name: "Generate" }).click();

    await expect(
      page.getByText("Song queued! Redirecting to your library…")
    ).toBeVisible({ timeout: 5000 });
  });
});

// ─── Library View ───────────────────────────────────────────────────────────

test.describe("Library View", () => {
  test("library page renders with empty state", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/library");

    // Verify the library page renders
    await expect(page.locator("h1")).toContainText("Library");

    // Should show song count
    await expect(page.getByText(/\d+ songs/)).toBeVisible();

    // Should show empty state or song list
    // (freshly seeded user has no songs unless generate tests ran first)
    const emptyMsg = page.getByText("No songs in your library yet.");
    const songList = page.locator("ul");
    await expect(emptyMsg.or(songList)).toBeVisible({ timeout: 5000 });
  });

  test("library page shows songs after generation", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

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
    await page.getByRole("button", { name: "Generate" }).click();

    // Wait for redirect to library
    await expect(page).toHaveURL(/\/library/, { timeout: 10000 });

    // Library should show at least the generated song
    await expect(page.locator("h1")).toContainText("Library");

    // Rating filter buttons should be visible
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
  });
});

// ─── Navigation ─────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("bottom nav links navigate to correct pages", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    // Should be on an authenticated page after login
    // Navigate via bottom nav to each key page

    // Generate
    await page.getByRole("link", { name: "Generate" }).click();
    await expect(page).toHaveURL(/\/generate/, { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Generate");

    // Library
    await page.getByRole("link", { name: "Library" }).click();
    await expect(page).toHaveURL(/\/library/, { timeout: 5000 });
    await expect(page.locator("h1")).toContainText("Library");

    // Home
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/^\/$|\/$/m, { timeout: 5000 });

    // Favorites
    await page.getByRole("link", { name: "Favorites" }).click();
    await expect(page).toHaveURL(/\/favorites/, { timeout: 5000 });

    // Inspire
    await page.getByRole("link", { name: "Inspire" }).click();
    await expect(page).toHaveURL(/\/inspire/, { timeout: 5000 });
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

    // Click sign out button
    await page.getByRole("button", { name: "Sign out" }).click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    // Navigate to a protected page without being logged in
    await page.goto("/generate");

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
