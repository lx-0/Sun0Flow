import { describe, it, expect } from "vitest";
import { dayDiff, computeStreakUpdate } from "./calculate";

describe("dayDiff", () => {
  it("returns 1 for consecutive days", () => {
    expect(dayDiff("2025-01-01", "2025-01-02")).toBe(1);
  });

  it("returns 0 for same day", () => {
    expect(dayDiff("2025-03-15", "2025-03-15")).toBe(0);
  });

  it("returns negative for reversed dates", () => {
    expect(dayDiff("2025-01-05", "2025-01-03")).toBe(-2);
  });

  it("handles month boundaries", () => {
    expect(dayDiff("2025-01-31", "2025-02-01")).toBe(1);
  });
});

describe("computeStreakUpdate", () => {
  it("starts a new streak when no existing state", () => {
    const result = computeStreakUpdate(null, "2025-01-01");
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: "2025-01-01",
    });
  });

  it("is idempotent for the same day", () => {
    const result = computeStreakUpdate(
      { currentStreak: 3, longestStreak: 5, lastActiveDate: "2025-01-05" },
      "2025-01-05"
    );
    expect(result).toEqual({
      currentStreak: 3,
      longestStreak: 5,
      lastActiveDate: "2025-01-05",
    });
  });

  it("increments streak on consecutive day", () => {
    const result = computeStreakUpdate(
      { currentStreak: 3, longestStreak: 5, lastActiveDate: "2025-01-04" },
      "2025-01-05"
    );
    expect(result).toEqual({
      currentStreak: 4,
      longestStreak: 5,
      lastActiveDate: "2025-01-05",
    });
  });

  it("updates longestStreak when current exceeds it", () => {
    const result = computeStreakUpdate(
      { currentStreak: 5, longestStreak: 5, lastActiveDate: "2025-01-04" },
      "2025-01-05"
    );
    expect(result).toEqual({
      currentStreak: 6,
      longestStreak: 6,
      lastActiveDate: "2025-01-05",
    });
  });

  it("resets streak after a gap of 2+ days", () => {
    const result = computeStreakUpdate(
      { currentStreak: 7, longestStreak: 10, lastActiveDate: "2025-01-01" },
      "2025-01-04"
    );
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 10,
      lastActiveDate: "2025-01-04",
    });
  });

  it("resets streak when lastActiveDate is null", () => {
    const result = computeStreakUpdate(
      { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
      "2025-01-01"
    );
    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: "2025-01-01",
    });
  });
});
