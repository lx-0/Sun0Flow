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

  // Suppress onboarding tour and API key wizard BEFORE any page navigation
  // so the welcome modal never renders and intercepts pointer events.
  await page.addInitScript(() => {
    try { localStorage.setItem("sunoflow-tour-completed", "true"); } catch {}
    try { localStorage.setItem("sunoflow-apikey-wizard-dismissed", "true"); } catch {}
  });

  if (loginRes.ok()) {
    // Session cookie is now set — navigate to the home page to complete auth
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
  } else {
    // Fallback: use the browser form (works on staging where PLAYWRIGHT_TEST is unset).
    // The login page is a "use client" component — we must wait for React hydration
    // before clicking Sign in, otherwise the form submits as plain HTML (no action attr)
    // and the page simply reloads on /login.

    // Listen for the providers-config fetch that fires in the login page's useEffect
    // — this signals that the component has mounted and event handlers are attached.
    const hydrationPromise = page.waitForResponse(
      (res) => res.url().includes("/api/auth/providers-config"),
      { timeout: 20000 },
    );
    await page.goto("/login");
    await hydrationPromise;

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);

    // Click and wait for the auth API call to confirm the JS handler fired
    const signInBtn = page.getByRole("button", { name: "Sign in" });
    await signInBtn.click();

    // Wait for the signIn() call to hit the auth backend
    await page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/") &&
        res.request().method() === "POST",
      { timeout: 15000 },
    );

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  }

  // Safety net: dismiss welcome modal ("Skip for now") or tour tooltip ("Skip tour")
  for (const label of ["Skip for now", "Skip tour"]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      await expect(btn).not.toBeVisible({ timeout: 2000 }).catch(() => {});
      break;
    }
  }

  // Dismiss email verification banner if present
  const dismissBanner = page.getByRole("button", { name: "Dismiss" });
  if (await dismissBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismissBanner.click();
  }
}

// ─── Shared Test User (registered once in globalSetup) ─────────────────────

import fs from "fs";
import path from "path";

let _sharedUser: { email: string; password: string; name: string } | null = null;

export function getSharedUser() {
  if (!_sharedUser) {
    const filePath = path.join(__dirname, ".shared-user.json");
    _sharedUser = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return _sharedUser!;
}

/** True when tests run against a remote staging/production server */
export const isRemote = process.env.PLAYWRIGHT_REMOTE === "true";

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

/** Intercept GET /api/credits to return available credits (prevents UpgradeModal) */
export async function mockCreditsAPI(page: Page, creditsRemaining = 50) {
  await page.route("**/api/credits", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          creditsRemaining,
          budget: 100,
          usagePercent: ((100 - creditsRemaining) / 100) * 100,
          isLow: creditsRemaining < 10,
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/** Intercept GET /api/songs to return mock songs */
export async function mockSongsAPI(page: Page, songs: ReturnType<typeof mockSong>[]) {
  const body = JSON.stringify({ songs, total: songs.length });
  const handler = async (route: import("@playwright/test").Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body,
      });
    } else {
      await route.continue();
    }
  };
  await page.route("**/api/songs?*", handler);
  await page.route("**/api/songs", handler);
}

/**
 * Navigate to a page and wait for the client-side /api/songs refetch to complete.
 * On staging, the SSR page renders with real data first; the client useEffect
 * then refetches from /api/songs which the mock intercepts.  Waiting for the
 * response ensures the mock data has been applied before assertions run.
 */
export async function gotoLibraryWithMock(page: Page, path = "/library") {
  const responseDone = page.waitForResponse(
    (res) => res.url().includes("/api/songs") && res.request().method() === "GET",
    { timeout: 15000 },
  );
  await page.goto(path);

  // If we were redirected to /login, the mock will never fire — fail fast
  if (page.url().includes("/login")) {
    throw new Error(
      `gotoLibraryWithMock: redirected to /login — login session is missing`,
    );
  }

  await responseDone;
  // Small settle time for React state update after response
  await page.waitForTimeout(300);
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
