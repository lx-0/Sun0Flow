import { describe, it, expect } from "vitest";
import { detectMood, extractTopics, suggestStyle, buildExcerpt, enrichItem } from "./enrich";

describe("detectMood", () => {
  it("detects energetic mood from keywords", () => {
    expect(detectMood("high energy dance party music")).toBe("energetic");
  });

  it("detects melancholic mood", () => {
    expect(detectMood("a sad lonely heartbreak ballad")).toBe("melancholic");
  });

  it("returns neutral when no keywords match", () => {
    expect(detectMood("technical documentation about APIs")).toBe("neutral");
  });

  it("picks the mood with the most keyword matches", () => {
    expect(detectMood("calm peaceful mellow relaxing easy smooth")).toBe("chill");
  });
});

describe("extractTopics", () => {
  it("extracts matching music topics", () => {
    const topics = extractTopics("a rock song with guitar and drums");
    expect(topics).toContain("rock");
    expect(topics).toContain("guitar");
    expect(topics).toContain("drums");
  });

  it("limits to 5 topics", () => {
    const text = "rock pop jazz blues classical electronic hip-hop rap country folk";
    expect(extractTopics(text).length).toBeLessThanOrEqual(5);
  });

  it("returns empty array for no matches", () => {
    expect(extractTopics("nothing relevant here")).toEqual([]);
  });
});

describe("suggestStyle", () => {
  it("combines genre, instrument, and mood style", () => {
    const style = suggestStyle("energetic", ["rock", "guitar", "summer"]);
    expect(style).toContain("rock");
    expect(style).toContain("guitar");
    expect(style).toContain("upbeat");
  });

  it("uses mood style map when no topics match", () => {
    expect(suggestStyle("dreamy", [])).toBe("ambient");
  });

  it("falls back to mood indie when mood has no style map entry", () => {
    expect(suggestStyle("mysterious", [])).toBe("mysterious indie");
  });

  it("falls back to indie alternative for neutral mood with no topics", () => {
    expect(suggestStyle("neutral", [])).toBe("indie, alternative");
  });
});

describe("buildExcerpt", () => {
  it("returns short text unchanged", () => {
    expect(buildExcerpt("Short text.")).toBe("Short text.");
  });

  it("truncates at sentence boundary when boundary is past 40% of maxLen", () => {
    const long = "x".repeat(60) + ". Second part " + "y".repeat(800);
    const excerpt = buildExcerpt(long, 100);
    expect(excerpt).toBe("x".repeat(60) + ".");
  });

  it("strips HTML tags from input", () => {
    expect(buildExcerpt("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });
});

describe("enrichItem", () => {
  it("adds mood, topics, suggestedStyle, and excerpt", () => {
    const item = { title: "Rock anthem", description: "guitar solo energy" };
    const enriched = enrichItem(item);
    expect(enriched.mood).toBe("energetic");
    expect(enriched.topics).toContain("rock");
    expect(enriched.topics).toContain("guitar");
    expect(enriched.suggestedStyle).toBeDefined();
    expect(enriched.excerpt).toBe("guitar solo energy");
  });
});
