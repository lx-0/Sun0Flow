import { test, expect } from "@playwright/test";
import {
  uniqueEmail,
  DEFAULT_PASSWORD,
  registerUser,
  loginViaUI,
} from "./helpers";

const TEST_PASSWORD = DEFAULT_PASSWORD;
let testEmail: string;

test.beforeAll(async ({ baseURL }) => {
  testEmail = uniqueEmail("settings");
  await registerUser(baseURL ?? "http://localhost:3200", {
    name: "Settings Tester",
    email: testEmail,
    password: TEST_PASSWORD,
  });
});

// ─── Settings Page Rendering ────────────────────────────────────────────────

test.describe("Settings Page", () => {
  test("settings page renders with tab navigation", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Main heading
    await expect(page.locator("h2").first()).toContainText("Settings");

    // Tab buttons
    await expect(page.getByRole("button", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preferences" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  });

  test("preferences tab shows appearance section with theme buttons", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Preferences tab
    await page.getByRole("button", { name: "Preferences" }).click();

    await expect(page.getByText("Appearance")).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();
    await expect(page.getByRole("button", { name: "System" }).first()).toBeVisible();
  });
});

// ─── Display Name Update ────────────────────────────────────────────────────

test.describe("Settings — Display Name", () => {
  test("update display name on profile tab", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Profile tab should be active by default
    const nameInput = page.getByPlaceholder("Your name");
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.clear();
    await nameInput.fill("Updated Name");

    // Click save
    await page.getByRole("button", { name: "Save Profile" }).click();

    // Wait for API response
    await page.waitForTimeout(1000);

    // Reload and verify persistence
    await page.reload();
    await expect(page.getByPlaceholder("Your name")).toHaveValue(
      "Updated Name",
      { timeout: 5000 }
    );
  });
});

// ─── Change Password ────────────────────────────────────────────────────────

test.describe("Settings — Change Password", () => {
  test("change password form is present on account tab", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Account tab
    await page.getByRole("button", { name: "Account" }).click();

    await expect(page.getByText("Change password")).toBeVisible();
    await expect(
      page.getByPlaceholder("Current password")
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("New password (min 8 chars)")
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("Confirm new password")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update password" })
    ).toBeVisible();
  });

  test("change password with valid credentials", async ({ page }) => {
    // Use a unique user for this test since we're changing the password
    const email = uniqueEmail("chgpwd");
    await registerUser("http://localhost:3200", {
      name: "Password Changer",
      email,
      password: TEST_PASSWORD,
    });
    await loginViaUI(page, email, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Account tab
    await page.getByRole("button", { name: "Account" }).click();

    await page.getByPlaceholder("Current password").fill(TEST_PASSWORD);
    await page
      .getByPlaceholder("New password (min 8 chars)")
      .fill("NewTestPass456!");
    await page
      .getByPlaceholder("Confirm new password")
      .fill("NewTestPass456!");

    await page.getByRole("button", { name: "Update password" }).click();

    // Wait for API response
    await page.waitForTimeout(2000);

    // Verify we can log in with the new password
    // Sign out first
    await page.goto("/");
    const signOutBtn = page.getByRole("button", { name: "Sign out" }).first();
    await signOutBtn.waitFor({ state: "visible", timeout: 5000 });
    await signOutBtn.click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });

    // Log in with new password
    await loginViaUI(page, email, "NewTestPass456!");
    // Should be on an authenticated page
    expect(page.url()).not.toContain("/login");
  });
});

// ─── Suno API Key ───────────────────────────────────────────────────────────

test.describe("Settings — API Key", () => {
  test("API key section renders on account tab", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Account tab
    await page.getByRole("button", { name: "Account" }).click();

    await expect(page.getByText("Suno API Key")).toBeVisible();
  });
});

// ─── Export Data ────────────────────────────────────────────────────────────

test.describe("Settings — Export Data", () => {
  test("export buttons are present on account tab", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Account tab
    await page.getByRole("button", { name: "Account" }).click();

    await expect(page.getByText("Export Data")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export all as JSON/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export songs as CSV/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Export playlists as JSON/i })
    ).toBeVisible();
  });

  test("export all as JSON triggers download", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Account tab
    await page.getByRole("button", { name: "Account" }).click();

    // Listen for download
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await page.getByRole("button", { name: /Export all as JSON/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });
});

// ─── Theme Switching ────────────────────────────────────────────────────────

test.describe("Settings — Theme", () => {
  test("clicking Dark theme button changes theme", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Preferences tab
    await page.getByRole("button", { name: "Preferences" }).click();

    await page.getByRole("button", { name: "Dark" }).click();

    // The html element should have dark class or data attribute
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 3000 });
  });

  test("clicking Light theme button removes dark class", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);
    await page.goto("/settings");

    // Switch to Preferences tab
    await page.getByRole("button", { name: "Preferences" }).click();

    // Switch to dark first
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 3000 });

    // Switch back to light
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/, {
      timeout: 3000,
    });
  });
});
