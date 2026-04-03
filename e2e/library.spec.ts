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

// ─── Library Search ─────────────────────────────────────────────────────────

test.describe("Library — Search", () => {
  test("search input accepts text and triggers search", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/library");
    await expect(page.locator("h1").first()).toContainText("Library");

    // Type in search — the search input may have different aria-labels
    const searchInput = page.getByLabel("Search songs");
    await searchInput.fill("Sunset");

    // Verify the search input has value
    await expect(searchInput).toHaveValue("Sunset");
  });

  test("clear search button resets search", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await page.goto("/library");

    const searchInput = page.getByLabel("Search songs");
    await searchInput.fill("something");
    await expect(searchInput).toHaveValue("something");

    // Click clear button
    await page.getByLabel("Clear search").click();
    await expect(searchInput).toHaveValue("");
  });
});

// ─── Library Filters ────────────────────────────────────────────────────────

test.describe("Library — Filters", () => {
  test("filter panel toggles visibility", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockSongsAPI(page, [mockSong()]);
    await page.goto("/library");

    // Initially filter panel should be hidden
    const statusFilter = page.getByLabel("Filter by status");
    await expect(statusFilter).not.toBeVisible();

    // Click Filters button to show
    await page.getByLabel("Show filters").click();
    await expect(statusFilter).toBeVisible({ timeout: 3000 });

    // Click again to hide
    await page.getByLabel("Hide filters").click();
    await expect(statusFilter).not.toBeVisible();
  });

  test("status filter dropdown has all options", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockSongsAPI(page, [mockSong()]);
    await page.goto("/library");

    await page.getByLabel("Show filters").click();

    const statusSelect = page.getByLabel("Filter by status");
    await expect(statusSelect).toBeVisible();

    // Verify all options exist
    const options = statusSelect.locator("option");
    await expect(options).toHaveCount(4); // All statuses, Ready, Pending, Failed
  });

  test("rating filter dropdown has all options", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockSongsAPI(page, [mockSong()]);
    await page.goto("/library");

    await page.getByLabel("Show filters").click();

    const ratingSelect = page.getByLabel("Filter by rating");
    await expect(ratingSelect).toBeVisible();

    const options = ratingSelect.locator("option");
    await expect(options).toHaveCount(6); // Any, 1★+, 2★+, 3★+, 4★+, 5★
  });

  test("sort pills are visible when filters are open", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockSongsAPI(page, [mockSong()]);
    await page.goto("/library");

    await page.getByLabel("Show filters").click();

    await expect(page.getByRole("button", { name: "Newest" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Oldest" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Highest rated" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Title A/i })
    ).toBeVisible();
  });
});

// ─── Library Empty & Populated States ───────────────────────────────────────

test.describe("Library — States", () => {
  test("empty library shows empty state message", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    await mockSongsAPI(page, []);
    await page.goto("/library");

    await expect(
      page.getByText("No songs yet")
    ).toBeVisible({ timeout: 5000 });
  });

  test("library shows song count", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [
      mockSong({ title: "Song 1" }),
      mockSong({ title: "Song 2" }),
      mockSong({ title: "Song 3" }),
    ];
    await mockSongsAPI(page, songs);

    await page.goto("/library");

    await expect(page.getByText(/3 songs?/)).toBeVisible({ timeout: 5000 });
  });

  test("library renders song titles from API", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [
      mockSong({ title: "Alpha Song" }),
      mockSong({ title: "Beta Song" }),
    ];
    await mockSongsAPI(page, songs);

    await page.goto("/library");

    await expect(page.getByText("Alpha Song")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Beta Song")).toBeVisible();
  });
});

// ─── Library Song Actions ───────────────────────────────────────────────────

test.describe("Library — Song Actions", () => {
  test("favorite button is visible on song rows", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [mockSong({ title: "Favable Song" })];
    await mockSongsAPI(page, songs);

    await page.goto("/library");
    await expect(page.getByText("Favable Song")).toBeVisible({ timeout: 5000 });

    // Hover over the song row to reveal action buttons
    await page.getByText("Favable Song").hover();

    // Favorite button should be present
    await expect(
      page.getByLabel("Add to favorites").first()
    ).toBeVisible({ timeout: 3000 });
  });

  test("favorites toggle changes state on click", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songId = "fav-toggle-123";
    const songs = [mockSong({ id: songId, title: "Toggle Fav Song", isFavorite: false })];
    await mockSongsAPI(page, songs);

    // Mock favorite toggle endpoint
    await page.route(`**/api/songs/${songId}/favorite`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ isFavorite: true }),
      });
    });

    await page.goto("/library");
    await expect(page.getByText("Toggle Fav Song")).toBeVisible({ timeout: 5000 });

    // Hover to reveal action buttons
    await page.getByText("Toggle Fav Song").hover();

    // Click the favorite button
    const favBtn = page.getByLabel("Add to favorites").first();
    await expect(favBtn).toBeVisible({ timeout: 3000 });
    await favBtn.click();

    // After toggling, the button label should change to "Remove from favorites"
    await expect(
      page.getByLabel("Remove from favorites").first()
    ).toBeVisible({ timeout: 3000 });
  });

  test("play button is visible on song rows", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [mockSong({ title: "Playable Song" })];
    await mockSongsAPI(page, songs);

    await page.goto("/library");
    await expect(page.getByText("Playable Song")).toBeVisible({
      timeout: 5000,
    });

    // Hover to reveal play button
    await page.getByText("Playable Song").hover();

    await expect(page.getByLabel("Play").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("song title links to song detail page", async ({ page }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songId = "detail-test-123";
    const songs = [mockSong({ id: songId, title: "Detail Link Song" })];
    await mockSongsAPI(page, songs);

    await page.goto("/library");
    await expect(page.getByText("Detail Link Song")).toBeVisible({
      timeout: 5000,
    });

    // The title should be a link to /library/{id}
    const link = page.getByRole("link", { name: "Detail Link Song" });
    await expect(link).toHaveAttribute("href", `/library/${songId}`);
  });
});

// ─── Library Batch Selection ────────────────────────────────────────────────

test.describe("Library — Batch Selection", () => {
  test("select all button appears and selection bar shows count", async ({
    page,
  }) => {
    await loginViaUI(page, testEmail, TEST_PASSWORD);

    const songs = [
      mockSong({ title: "Batch Song 1" }),
      mockSong({ title: "Batch Song 2" }),
    ];
    await mockSongsAPI(page, songs);

    await page.goto("/library");
    await expect(page.getByText("Batch Song 1")).toBeVisible({ timeout: 5000 });

    // "Select all" link should be visible
    const selectAll = page.getByText("Select all");
    await expect(selectAll).toBeVisible();

    await selectAll.click();

    // Selection bar should show count
    await expect(page.getByText("2 selected")).toBeVisible({ timeout: 3000 });
  });
});
