import { describe, it, expect } from "vitest";
import { buildPromptFromItem, buildSimplePromptFromItem, rankItems } from "./build-prompt";
import type { RssItem } from "@/lib/rss";

describe("buildPromptFromItem", () => {
  it("generates a narrative prompt when excerpt has content", () => {
    const item: RssItem = {
      title: "AI Revolution in Music",
      description: "Artificial intelligence is transforming how we create and listen to music. New tools allow anyone to compose.",
      mood: "energetic",
      topics: ["technology", "creativity"],
      suggestedStyle: "electronic pop",
    };

    const result = buildPromptFromItem(item);

    expect(result.name).toBe("AI Revolution in Music");
    expect(result.prompt).toContain("energetic");
    expect(result.style).toBe("electronic pop");
    expect(result.excerpt).toBeNull();
  });

  it("uses excerpt over description when available", () => {
    const item: RssItem = {
      title: "Test Article",
      description: "Short desc",
      excerpt: "This is a longer excerpt that provides much more context about the article content and themes discussed within.",
    };

    const result = buildPromptFromItem(item);

    expect(result.prompt).not.toBe("");
    expect(result.excerpt).toBe(item.excerpt);
  });

  it("falls back to keyword prompt when content is short", () => {
    const item: RssItem = {
      title: "Quick Update on Tours",
      description: "Short.",
      mood: "chill",
      topics: ["indie", "rock"],
    };

    const result = buildPromptFromItem(item);

    expect(result.prompt).toContain("chill mood");
    expect(result.prompt).toContain("indie, rock");
    expect(result.prompt).toContain('inspired by "Quick Update on Tours"');
  });

  it("uses fallback templates when mood is not recognized", () => {
    const item: RssItem = {
      title: "Something Interesting Happened Today in Science",
      description: "Scientists discovered a new way to harness energy from ambient sound waves. The breakthrough could change everything.",
    };

    const result = buildPromptFromItem(item);

    expect(result.prompt).toBeTruthy();
    expect(result.name.length).toBeLessThanOrEqual(60);
  });

  it("truncates long titles to 60 chars for name", () => {
    const item: RssItem = {
      title: "A".repeat(100),
      description: "Some content here that is long enough to trigger narrative path.",
    };

    const result = buildPromptFromItem(item);

    expect(result.name.length).toBeLessThanOrEqual(60);
  });

  it("defaults name when title is empty", () => {
    const item: RssItem = {
      title: "",
      description: "Some content.",
    };

    const result = buildPromptFromItem(item);

    expect(result.name).toBe("Auto-generated prompt");
  });

  it("builds style from mood and topics when no suggestedStyle", () => {
    const item: RssItem = {
      title: "Test",
      description: "Short.",
      mood: "dark",
      topics: ["ambient", "drone", "noise"],
    };

    const result = buildPromptFromItem(item);

    expect(result.style).toBe("dark, ambient, drone, noise");
  });
});

describe("buildSimplePromptFromItem", () => {
  it("builds a keyword-based prompt from item fields", () => {
    const item = {
      title: "Breaking News About Space",
      description: "NASA announced a new mission to Mars.",
      mood: "intense",
      topics: ["space", "exploration"],
    };

    const result = buildSimplePromptFromItem(item);

    expect(result.prompt).toContain("intense mood");
    expect(result.prompt).toContain("space, exploration");
    expect(result.prompt).toContain('inspired by "Breaking News About Space"');
  });

  it("includes content body when long enough", () => {
    const item = {
      title: "Article",
      description: "This is a detailed description of the article content that exceeds twenty characters.",
    };

    const result = buildSimplePromptFromItem(item);

    expect(result.prompt).toContain("This is a detailed description");
  });

  it("uses suggestedStyle when available", () => {
    const item = {
      title: "Test",
      description: "Short.",
      mood: "chill",
      topics: ["lo-fi"],
      suggestedStyle: "lo-fi hip hop beats",
    };

    const result = buildSimplePromptFromItem(item);

    expect(result.style).toBe("lo-fi hip hop beats");
  });

  it("falls back to mood+topics for style", () => {
    const item = {
      title: "Test",
      description: "Short.",
      mood: "melancholic",
      topics: ["piano", "strings"],
    };

    const result = buildSimplePromptFromItem(item);

    expect(result.style).toBe("melancholic, piano, strings");
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

  it("scores zero for a bare item", () => {
    const items: RssItem[] = [
      { title: "", description: "" },
      { title: "A long title here", description: "A description that is over twenty chars", mood: "chill", topics: ["jazz"] },
    ];

    const ranked = rankItems(items, 2);

    expect(ranked[0].title).toBe("A long title here");
    expect(ranked[1].title).toBe("");
  });
});
