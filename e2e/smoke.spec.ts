import { test, expect } from "@playwright/test";

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
