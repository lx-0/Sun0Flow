import { test, expect } from "@playwright/test";
import { loginViaUI, registerUser, uniqueEmail, DEFAULT_PASSWORD } from "./helpers";

test("homepage loads successfully", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
});

test("/generate page loads and renders content", async ({ page }) => {
  const response = await page.goto("/generate");
  expect(response?.status()).toBe(200);
  // Should render page content (not crash with blank screen)
  await expect(page.locator("body")).not.toBeEmpty();
});

test("/mashup page loads without crash", async ({ page }) => {
  const response = await page.goto("/mashup");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).not.toBeEmpty();
});

// ─── Error Scenarios ─────────────────────────────────────────────────────────

test.describe("Error Scenarios", () => {
  test("404 page renders for invalid routes", async ({ page }) => {
    // Must be authenticated — middleware redirects unauthenticated requests to /login
    await loginViaUI(page, errorEmail, DEFAULT_PASSWORD);
    const response = await page.goto("/this-route-does-not-exist-e2e-test");
    // Next.js renders not-found.tsx with a 404 status
    expect(response?.status()).toBe(404);
    await expect(page.locator("text=Page not found")).toBeVisible();
    await expect(page.locator("text=404")).toBeVisible();
  });

  test("404 page has navigation links back to app", async ({ page }) => {
    // Must be authenticated — middleware redirects unauthenticated requests to /login
    await loginViaUI(page, errorEmail, DEFAULT_PASSWORD);
    await page.goto("/invalid-route-xyz-abc");
    await expect(page.getByRole("link", { name: "Go Home" })).toBeVisible();
  });

  let errorEmail: string;

  test.beforeEach(async ({ baseURL }) => {
    errorEmail = uniqueEmail("error");
    await registerUser(baseURL ?? "http://localhost:3200", {
      name: "Error Tester",
      email: errorEmail,
      password: DEFAULT_PASSWORD,
    });
  });

  test("library handles API error gracefully", async ({ page }) => {
    await loginViaUI(page, errorEmail, DEFAULT_PASSWORD);

    // Mock the songs API to return a server error
    await page.route("**/api/songs*", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Internal server error" }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/library");

    // Page should still render (not crash) even if API returns an error
    await expect(page.locator("body")).not.toBeEmpty();
    await expect(page).toHaveURL(/\/library/);
  });

  test("generate page handles API error gracefully", async ({ page }) => {
    await loginViaUI(page, errorEmail, DEFAULT_PASSWORD);

    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto("/generate");
    await page.getByLabel("Style / genre").fill("jazz");
    await page.locator('button[type="submit"]').click();

    // Should show an error message rather than crashing
    await expect(
      page.getByText(/error|failed|something went wrong/i).first()
    ).toBeVisible({ timeout: 5000 });
    // Should remain on the generate page
    await expect(page).toHaveURL(/\/generate/);
  });
});
