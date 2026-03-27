import { type Page, expect } from "@playwright/test";

// ─── Test User Factory ──────────────────────────────────────────────────────

export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
}

export const DEFAULT_PASSWORD = "E2eTestPass123!";

export async function registerUser(
  baseURL: string,
  user: { name: string; email: string; password: string }
) {
  const res = await fetch(`${baseURL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (res.status !== 201) {
    throw new Error(
      `Failed to register user: ${res.status} ${await res.text()}`
    );
  }
  return res;
}

export async function loginViaUI(
  page: Page,
  email: string,
  password: string
) {
  // In CI (when PLAYWRIGHT_TEST dev server is running), use a direct API login
  // endpoint that bypasses the CSRF check which fails in headless Chromium.
  // Locally, fall back to the UI form which works fine with a running dev server.
  const baseURL = page.context().browser()?.contexts()[0]?.pages()[0]
    ? (page.context() as { _options?: { baseURL?: string } })._options?.baseURL
    : undefined;
  const appBase = baseURL ?? "http://localhost:3200";

  // Try the test login API (available only when PLAYWRIGHT_TEST=true on the server)
  const loginRes = await page.request.post(`${appBase}/api/test/login`, {
    data: { email, password },
    headers: { "Content-Type": "application/json" },
  });

  if (loginRes.ok()) {
    // Session cookie is now set — navigate to the home page to complete auth
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
    // Belt-and-suspenders: suppress onboarding tour via localStorage so it
    // can't intercept pointer events even if the session token is stale
    await page.evaluate(() => {
      try { localStorage.setItem("sunoflow-tour-completed", "true"); } catch {}
    });
  } else {
    // Fallback: use the browser form (works locally with existing CSRF cookies)
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
  }

  // Dismiss onboarding tour if present
  const skipTour = page.getByRole("button", { name: "Skip tour" }).first();
  if (await skipTour.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipTour.click();
    await expect(skipTour).not.toBeVisible({ timeout: 2000 }).catch(() => {});
  }

  // Dismiss email verification banner if present
  const dismissBanner = page.getByRole("button", { name: "Dismiss" });
  if (await dismissBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismissBanner.click();
  }
}

// ─── Mock Song Data ─────────────────────────────────────────────────────────

export function mockSong(overrides: Record<string, unknown> = {}) {
  return {
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: "test-user",
    sunoJobId: null,
    title: "Mock Song",
    prompt: "test prompt",
    tags: "test",
    audioUrl: "https://example.com/audio.mp3",
    imageUrl: null,
    duration: 120,
    lyrics: null,
    sunoModel: null,
    generationStatus: "ready",
    errorMessage: null,
    pollCount: 0,
    isFavorite: false,
    isPublic: false,
    publicSlug: null,
    rating: null,
    ratingNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function mockPlaylist(overrides: Record<string, unknown> = {}) {
  return {
    id: `pl-mock-${Date.now()}`,
    name: "Test Playlist",
    description: null,
    userId: "test-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { songs: 0 },
    ...overrides,
  };
}

// ─── API Route Interceptors ─────────────────────────────────────────────────

/** Intercept GET /api/songs to return mock songs */
export async function mockSongsAPI(page: Page, songs: ReturnType<typeof mockSong>[]) {
  await page.route("**/api/songs?*", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ songs, total: songs.length }),
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/songs", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ songs, total: songs.length }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Intercept GET /api/playlists to return mock playlists */
export async function mockPlaylistsAPI(
  page: Page,
  playlists: ReturnType<typeof mockPlaylist>[]
) {
  await page.route("**/api/playlists", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(playlists),
      });
    } else {
      await route.continue();
    }
  });
}
