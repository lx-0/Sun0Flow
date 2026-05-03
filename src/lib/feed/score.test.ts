import { describe, it, expect } from "vitest";
import { trendingScore, affinityScore } from "./score";

describe("trendingScore", () => {
  it("scores higher for more plays", () => {
    const now = new Date();
    expect(trendingScore(100, 0, now)).toBeGreaterThan(
      trendingScore(10, 0, now),
    );
  });

  it("weights downloads 2x plays", () => {
    const now = new Date();
    expect(trendingScore(0, 50, now)).toBe(trendingScore(100, 0, now));
  });

  it("decays with age", () => {
    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(trendingScore(100, 0, now)).toBeGreaterThan(
      trendingScore(100, 0, weekAgo),
    );
  });

  it("returns 0 for zero engagement", () => {
    expect(trendingScore(0, 0, new Date())).toBe(0);
  });
});

describe("affinityScore", () => {
  it("returns 0 when no tags", () => {
    const prefs = new Map([["rock", 3]]);
    expect(affinityScore([], prefs)).toBe(0);
  });

  it("returns 0 when no preferences", () => {
    expect(affinityScore(["rock"], new Map())).toBe(0);
  });

  it("sums weights of matching tags", () => {
    const prefs = new Map([
      ["rock", 3],
      ["indie", 2],
      ["pop", 1],
    ]);
    expect(affinityScore(["rock", "indie"], prefs)).toBe(5);
  });

  it("ignores tags not in preferences", () => {
    const prefs = new Map([["rock", 3]]);
    expect(affinityScore(["jazz", "classical"], prefs)).toBe(0);
  });

  it("handles partial matches", () => {
    const prefs = new Map([
      ["rock", 3],
      ["indie", 2],
    ]);
    expect(affinityScore(["rock", "jazz"], prefs)).toBe(3);
  });
});
