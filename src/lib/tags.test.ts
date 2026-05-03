import { describe, it, expect } from "vitest";
import { parseTags, normalizeTagCombo } from "./tags";

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
