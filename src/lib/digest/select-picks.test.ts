import { describe, it, expect } from "vitest";
import { selectPicks } from "./select-picks";
import type { DigestItem } from "./types";

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
      item({ title: `Item ${i}`, mood: `mood-${i}`, feedTitle: `feed-${i}` })
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
    const sameFeedCount = picks.filter((p) => p.feedTitle === "same-feed").length;
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
