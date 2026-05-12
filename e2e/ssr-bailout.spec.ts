import { test, expect } from "@playwright/test";
import { DEFAULT_PASSWORD, getSharedUser, loginViaUI } from "./helpers";

const BAILOUT_MARKER = "BAILOUT_TO_CLIENT_SIDE_RENDERING";

test.describe("SSR bailout regression", () => {
  test("home route HTML does not include SSR bailout marker", async ({ page }) => {
    const response = await page.request.get("/");
    expect(response.ok()).toBeTruthy();

    const html = await response.text();
    expect(html).not.toContain(BAILOUT_MARKER);
  });

  test("authenticated generate route HTML does not include SSR bailout marker", async ({ page }) => {
    const { email } = getSharedUser();
    await loginViaUI(page, email, DEFAULT_PASSWORD);

    const response = await page.request.get("/generate");
    expect(response.ok()).toBeTruthy();

    const html = await response.text();
    expect(html).not.toContain(BAILOUT_MARKER);
  });
});
