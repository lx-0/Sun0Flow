import { describe, it, expect } from "vitest";
import { buildPrompt } from "./build-prompt";

describe("buildPrompt", () => {
  it("combines mood, topics, and title", () => {
    const result = buildPrompt("A Rainy Day in Tokyo", "melancholic", ["jazz", "rain"]);
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
