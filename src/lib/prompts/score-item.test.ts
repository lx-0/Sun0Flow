import { describe, it, expect } from "vitest";
import { scoreItem, rankItems } from "./score-item";
import type { RssItem } from "@/lib/rss";

describe("scoreItem", () => {
  it("scores zero for a bare item", () => {
    const item: RssItem = { title: "", description: "" };
    expect(scoreItem(item)).toBe(0);
  });

  it("adds 2 for a non-neutral mood", () => {
    const item: RssItem = { title: "", description: "", mood: "energetic" };
    expect(scoreItem(item)).toBe(2);
  });

  it("does not score neutral mood", () => {
    const item: RssItem = { title: "", description: "", mood: "neutral" };
    expect(scoreItem(item)).toBe(0);
  });

  it("adds topic count to score", () => {
    const item: RssItem = { title: "", description: "", topics: ["a", "b", "c"] };
    expect(scoreItem(item)).toBe(3);
  });

  it("adds 1 for title longer than 10 chars", () => {
    const item: RssItem = { title: "A long title here", description: "" };
    expect(scoreItem(item)).toBe(1);
  });

  it("adds 1 for description longer than 20 chars", () => {
    const item: RssItem = { title: "", description: "A description that is over twenty chars" };
    expect(scoreItem(item)).toBe(1);
  });

  it("combines all scoring factors", () => {
    const item: RssItem = {
      title: "Long enough title",
      description: "Description with enough characters",
      mood: "chill",
      topics: ["jazz", "soul"],
    };
    // mood=2, topics=2, title=1, description=1
    expect(scoreItem(item)).toBe(6);
  });
});

describe("rankItems", () => {
  it("returns items sorted by score descending", () => {
    const items: RssItem[] = [
      { title: "Low", description: "" },
      { title: "High score item!", description: "Long enough description here", mood: "dark", topics: ["x", "y"] },
      { title: "Medium item", description: "Also a decent description length" },
    ];

    const ranked = rankItems(items, 3);

    expect(ranked[0].title).toBe("High score item!");
    expect(ranked[2].title).toBe("Low");
  });

  it("limits results to the requested count", () => {
    const items: RssItem[] = [
      { title: "A long title one", description: "" },
      { title: "A long title two", description: "" },
      { title: "A long title three", description: "" },
    ];

    const ranked = rankItems(items, 2);

    expect(ranked).toHaveLength(2);
  });

  it("handles empty array", () => {
    expect(rankItems([], 5)).toEqual([]);
  });
});
