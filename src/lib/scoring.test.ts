import { describe, it, expect, vi, afterEach } from "vitest";
import { trendingScore } from "./scoring";

describe("trendingScore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns higher scores for more engagement", () => {
    const now = new Date();
    const low = trendingScore(10, 1, now);
    const high = trendingScore(100, 10, now);
    expect(high).toBeGreaterThan(low);
  });

  it("decays score over time", () => {
    vi.useFakeTimers({ now: new Date("2025-05-01") });
    const recent = trendingScore(100, 10, new Date("2025-04-30"));
    const old = trendingScore(100, 10, new Date("2025-03-01"));
    expect(recent).toBeGreaterThan(old);
  });

  it("weights secondary metric at 2x", () => {
    const now = new Date();
    const onlyPrimary = trendingScore(10, 0, now);
    const withSecondary = trendingScore(10, 5, now);
    expect(withSecondary).toBe(onlyPrimary + 10);
  });

  it("returns 0 for zero engagement", () => {
    expect(trendingScore(0, 0, new Date())).toBe(0);
  });
});
