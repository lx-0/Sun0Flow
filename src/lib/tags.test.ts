import { describe, it, expect } from "vitest";
import { parseTags, normalizeTagCombo, collectSongTokens, tagOverlapScore } from "./tags";

describe("parseTags", () => {
  it("splits comma-separated tags", () => {
    expect(parseTags("pop, rock, jazz")).toEqual(["pop", "rock", "jazz"]);
  });

  it("splits semicolon-separated tags", () => {
    expect(parseTags("pop;rock;jazz")).toEqual(["pop", "rock", "jazz"]);
  });

  it("splits whitespace-separated tags", () => {
    expect(parseTags("pop rock jazz")).toEqual(["pop", "rock", "jazz"]);
  });

  it("handles mixed separators", () => {
    expect(parseTags("pop, rock; jazz electronic")).toEqual([
      "pop",
      "rock",
      "jazz",
      "electronic",
    ]);
  });

  it("lowercases all tags", () => {
    expect(parseTags("Pop, ROCK, Jazz")).toEqual(["pop", "rock", "jazz"]);
  });

  it("filters empty strings", () => {
    expect(parseTags(",, pop,,")).toEqual(["pop"]);
  });

  it("returns empty array for null", () => {
    expect(parseTags(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });
});

describe("normalizeTagCombo", () => {
  it("sorts tags alphabetically", () => {
    expect(normalizeTagCombo("rock, jazz, pop")).toBe("jazz, pop, rock");
  });

  it("returns empty string for null", () => {
    expect(normalizeTagCombo(null)).toBe("");
  });
});

describe("collectSongTokens", () => {
  it("merges songTags and tags string, deduped and lowercased", () => {
    const songTags = [
      { tag: { name: "Pop" } },
      { tag: { name: "Rock" } },
    ];
    expect(collectSongTokens(songTags, "rock, jazz")).toEqual(
      expect.arrayContaining(["pop", "rock", "jazz"]),
    );
    expect(collectSongTokens(songTags, "rock, jazz")).toHaveLength(3);
  });

  it("handles empty songTags", () => {
    expect(collectSongTokens([], "pop, rock")).toEqual(["pop", "rock"]);
  });

  it("handles null tags string", () => {
    const songTags = [{ tag: { name: "pop" } }];
    expect(collectSongTokens(songTags, null)).toEqual(["pop"]);
  });

  it("returns empty for both empty", () => {
    expect(collectSongTokens([], null)).toEqual([]);
  });
});

describe("tagOverlapScore", () => {
  it("returns 0 for two empty arrays", () => {
    expect(tagOverlapScore([], [])).toBe(0);
  });

  it("returns 0 for no overlap", () => {
    expect(tagOverlapScore(["pop", "rock"], ["jazz", "blues"])).toBe(0);
  });

  it("returns 1 for identical sets", () => {
    expect(tagOverlapScore(["pop", "rock"], ["pop", "rock"])).toBe(1);
  });

  it("scores partial overlap correctly", () => {
    expect(tagOverlapScore(["pop", "rock", "jazz"], ["pop", "rock"])).toBeCloseTo(2 / 3);
  });

  it("uses max(|a|,|b|) as denominator", () => {
    expect(tagOverlapScore(["pop"], ["pop", "rock", "jazz"])).toBeCloseTo(1 / 3);
  });
});
