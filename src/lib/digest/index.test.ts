import { describe, it, expect } from "vitest";
import { buildPrompt, selectPicks } from "./index";
import type { DigestItem } from "./index";

function item(overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    source: "rss",
    title: "Test",
    mood: "neutral",
    topics: [],
    suggestedPrompt: "test prompt",
    ...overrides,
  };
}

describe("buildPrompt", () => {
  it("combines mood, topics, and title", () => {
    const result = buildPrompt("A Rainy Day in Tokyo", "melancholic", [
      "jazz",
      "rain",
    ]);
    expect(result).toBe('melancholic vibe — jazz, rain — "A Rainy Day in Tokyo"');
  });

  it("skips neutral mood", () => {
    const result = buildPrompt("Some Article", "neutral", ["rock"]);
    expect(result).toBe('rock — "Some Article"');
  });

  it("skips empty mood string", () => {
    const result = buildPrompt("Some Article", "", ["pop"]);
    expect(result).toBe('pop — "Some Article"');
  });

  it("skips title shorter than 6 chars", () => {
    const result = buildPrompt("Hi", "chill", ["ambient"]);
    expect(result).toBe("chill vibe — ambient");
  });

  it("skips title 80 chars or longer", () => {
    const longTitle = "x".repeat(80);
    const result = buildPrompt(longTitle, "energetic", ["rock"]);
    expect(result).toBe("energetic vibe — rock");
  });

  it("limits topics to 3", () => {
    const result = buildPrompt("Title Here", "dreamy", ["a", "b", "c", "d"]);
    expect(result).toBe('dreamy vibe — a, b, c — "Title Here"');
  });

  it("falls back to truncated title when no parts", () => {
    const result = buildPrompt("Short", "neutral", []);
    expect(result).toBe("Short");
  });

  it("truncates fallback title to 100 chars", () => {
    const longTitle = "x".repeat(150);
    const result = buildPrompt(longTitle, "neutral", []);
    expect(result).toBe("x".repeat(100));
  });
});

describe("selectPicks", () => {
  it("returns empty array for empty input", () => {
    expect(selectPicks([])).toEqual([]);
  });

  it("returns all items when fewer than PICKS_MIN", () => {
    const items = [item({ title: "A" }), item({ title: "B" })];
    expect(selectPicks(items)).toHaveLength(2);
  });

  it("caps at PICKS_MAX (5)", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item({
        title: `Item ${i}`,
        mood: `mood-${i}`,
        feedTitle: `feed-${i}`,
      }),
    );
    expect(selectPicks(items)).toHaveLength(5);
  });

  it("prioritizes mood diversity in first pass", () => {
    const items = [
      item({ title: "A", mood: "energetic", feedTitle: "f1" }),
      item({ title: "B", mood: "energetic", feedTitle: "f2" }),
      item({ title: "C", mood: "chill", feedTitle: "f1" }),
      item({ title: "D", mood: "melancholic", feedTitle: "f2" }),
    ];
    const picks = selectPicks(items);
    const moods = picks.map((p) => p.mood);
    expect(moods).toContain("energetic");
    expect(moods).toContain("chill");
    expect(moods).toContain("melancholic");
  });

  it("enforces MAX_PER_SOURCE (2) during first two passes", () => {
    const items = [
      item({ title: "A", mood: "a", feedTitle: "same-feed" }),
      item({ title: "B", mood: "b", feedTitle: "same-feed" }),
      item({ title: "C", mood: "c", feedTitle: "same-feed" }),
      item({ title: "D", mood: "d", feedTitle: "other-feed" }),
      item({ title: "E", mood: "e", feedTitle: "other-feed" }),
    ];
    const picks = selectPicks(items);
    const sameFeedCount = picks.filter(
      (p) => p.feedTitle === "same-feed",
    ).length;
    expect(sameFeedCount).toBeLessThanOrEqual(2);
  });

  it("relaxes source constraint in third pass to reach PICKS_MIN", () => {
    const items = [
      item({ title: "A", mood: "a", feedTitle: "only-feed" }),
      item({ title: "B", mood: "a", feedTitle: "only-feed" }),
      item({ title: "C", mood: "a", feedTitle: "only-feed" }),
    ];
    const picks = selectPicks(items);
    expect(picks).toHaveLength(3);
    expect(picks.every((p) => p.feedTitle === "only-feed")).toBe(true);
  });

  it("uses 'unknown' as source key when feedTitle is missing", () => {
    const items = [
      item({ title: "A", mood: "a" }),
      item({ title: "B", mood: "b" }),
      item({ title: "C", mood: "c" }),
    ];
    const picks = selectPicks(items);
    expect(picks).toHaveLength(3);
  });
});
