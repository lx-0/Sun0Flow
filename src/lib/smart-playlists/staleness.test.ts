import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshThreshold, isStale } from "./staleness";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

describe("refreshThreshold", () => {
  it("returns weekly threshold for top_hits", () => {
    expect(refreshThreshold("top_hits")).toBe(WEEK_MS);
  });

  it("returns weekly threshold for similar_to", () => {
    expect(refreshThreshold("similar_to")).toBe(WEEK_MS);
  });

  it("returns daily threshold for new_this_week", () => {
    expect(refreshThreshold("new_this_week")).toBe(DAY_MS);
  });

  it("returns daily threshold for mood", () => {
    expect(refreshThreshold("mood")).toBe(DAY_MS);
  });
});

describe("isStale", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats null lastRefreshedAt as stale", () => {
    expect(isStale("top_hits", null)).toBe(true);
  });

  it("returns false when refreshed recently for a daily type", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    expect(isStale("mood", tenMinutesAgo)).toBe(false);
  });

  it("returns true when refreshed over a day ago for a daily type", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS);
    expect(isStale("new_this_week", twoDaysAgo)).toBe(true);
  });

  it("returns false when refreshed 3 days ago for a weekly type", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * DAY_MS);
    expect(isStale("top_hits", threeDaysAgo)).toBe(false);
  });

  it("returns true when refreshed 8 days ago for a weekly type", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS);
    expect(isStale("similar_to", eightDaysAgo)).toBe(true);
  });
});
