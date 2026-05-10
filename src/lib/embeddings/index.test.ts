import { describe, it, expect } from "vitest";
import {
  buildSongEmbeddingText,
  cosineSimilarity,
  computeCentroid,
} from "@/lib/embeddings";

describe("buildSongEmbeddingText", () => {
  it("combines tags, title, prompt, and lyrics snippet", () => {
    const text = buildSongEmbeddingText({
      title: "Ocean Waves",
      tags: "ambient, chill",
      prompt: "calm ocean vibes",
      lyrics: "Rolling waves\nPeaceful shores",
    });
    expect(text).toContain("ambient, chill");
    expect(text).toContain("Ocean Waves");
    expect(text).toContain("calm ocean vibes");
    expect(text).toContain("Rolling waves");
  });

  it("handles null fields gracefully", () => {
    const text = buildSongEmbeddingText({
      title: null,
      tags: null,
      prompt: null,
      lyrics: null,
    });
    expect(text).toBe("instrumental music");
  });

  it("truncates long prompts to 300 chars", () => {
    const longPrompt = "x".repeat(500);
    const text = buildSongEmbeddingText({
      title: null,
      tags: null,
      prompt: longPrompt,
      lyrics: null,
    });
    expect(text).toContain("x".repeat(300));
    expect(text).not.toContain("x".repeat(301));
  });

  it("skips short lyrics snippets", () => {
    const text = buildSongEmbeddingText({
      title: "Test",
      tags: null,
      prompt: null,
      lyrics: "short",
    });
    expect(text).not.toContain("lyrics:");
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("returns -1 for opposite vectors", () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it("returns 0 for zero-length vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 for mismatched dimensions", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles all-zero vector without NaN", () => {
    const zero = [0, 0, 0];
    const other = [1, 2, 3];
    expect(cosineSimilarity(zero, other)).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    // [1,1] vs [1,0] → cos(45°) ≈ 0.707
    const a = [1, 1];
    const b = [1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.SQRT1_2, 5);
  });
});

describe("computeCentroid", () => {
  it("returns null for empty input", () => {
    expect(computeCentroid([])).toBeNull();
  });

  it("returns the same vector for single input", () => {
    const v = [1, 2, 3];
    const result = computeCentroid([v]);
    expect(result).toEqual(v);
  });

  it("averages multiple vectors", () => {
    const result = computeCentroid([
      [0, 0],
      [2, 4],
    ]);
    expect(result).toEqual([1, 2]);
  });

  it("computes centroid of three vectors correctly", () => {
    const result = computeCentroid([
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ]);
    expect(result).toEqual([1, 1, 1]);
  });
});
