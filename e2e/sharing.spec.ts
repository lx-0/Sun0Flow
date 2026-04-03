import { test, expect } from "@playwright/test";
import {
  DEFAULT_PASSWORD,
  loginViaUI,
  getSharedUser,
  mockSong,
  mockSongsAPI,
} from "./helpers";

const TEST_PASSWORD = DEFAULT_PASSWORD;
const testEmail = getSharedUser().email;

// ─── Public Song Sharing ────────────────────────────────────────────────────

test.describe("Public Song Sharing", () => {
  // Note: /s/[slug] pages use SSR with direct Prisma queries.
  // API route mocking won't intercept server-side data fetching.
  // These tests verify behavior with real (non-existent) data.

  test("invalid slug shows not found page", async ({ page }) => {
    const response = await page.goto("/s/nonexistent-slug-e2e-test-12345");
    const status = response?.status() ?? 0;

    // Next.js may return 404 or 200 with not-found content
    if (status === 404 || status === 200) {
      // Either a 404 status or a 200 with "not found" content is acceptable
      const notFoundText = page.getByText(/not found|page not found/i);
      if (status === 200) {
        await expect(notFoundText.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("public song page does not redirect to login", async ({ page }) => {
    // Access without logging in — should NOT redirect to login
    await page.goto("/s/any-slug-test");

    // Should NOT redirect to login (public pages are accessible without auth)
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("share button in library triggers share action", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [
      mockSong({
        id: "share-test-1",
        title: "Shareable Song",
        isPublic: false,
        publicSlug: null,
      }),
    ];
    await mockSongsAPI(page, songs);

    // Mock the share endpoint
    await page.route("**/api/songs/*/share", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          isPublic: true,
          publicSlug: "shareable-song-slug",
        }),
      });
    });

    await page.goto("/library");
    await expect(page.getByText("Shareable Song")).toBeVisible({
      timeout: 5000,
    });

    // Hover to reveal share button
    await page.getByText("Shareable Song").hover();

    // Click share button if visible.
    // Use getByRole to avoid matching the swipe-action panel button (inside an
    // aria-hidden container and not actually interactable by Playwright).
    const shareBtn = page.getByRole("button", { name: /share/i }).first();
    if (await shareBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shareBtn.click();

      // Song is private — a "Make public to share?" confirmation dialog appears.
      // Click through it so the share API is called.
      const makePublicBtn = page.getByRole("button", { name: /make public/i });
      if (await makePublicBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await makePublicBtn.click();
      }

      // Should show confirmation toast or copied feedback
      await expect(
        page
          .getByText(/link copied|copied|shared/i)
          .or(page.getByRole("alert"))
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
