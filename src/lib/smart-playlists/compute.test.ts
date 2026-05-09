import { describe, it, expect } from "vitest";
import { rankBySimilarity, type EmbeddingCandidate } from "./compute";

describe("rankBySimilarity", () => {
  it("returns song IDs sorted by cosine similarity descending", () => {
    const query = [1, 0, 0];
    const candidates: EmbeddingCandidate[] = [
      { songId: "low", embedding: [0, 1, 0] },
      { songId: "high", embedding: [1, 0, 0] },
      { songId: "mid", embedding: [0.7, 0.7, 0] },
    ];

    const result = rankBySimilarity(query, candidates, 3);
    expect(result).toEqual(["high", "mid", "low"]);
  });

  it("respects the limit parameter", () => {
    const query = [1, 0];
    const candidates: EmbeddingCandidate[] = [
      { songId: "a", embedding: [1, 0] },
      { songId: "b", embedding: [0.9, 0.1] },
      { songId: "c", embedding: [0.5, 0.5] },
    ];

    const result = rankBySimilarity(query, candidates, 2);
    expect(result).toHaveLength(2);
    expect(result).toEqual(["a", "b"]);
  });

  it("returns empty array for empty candidates", () => {
    expect(rankBySimilarity([1, 0], [], 10)).toEqual([]);
  });

  it("handles identical vectors (similarity = 1)", () => {
    const vec = [0.5, 0.5, 0.5];
    const result = rankBySimilarity(vec, [{ songId: "same", embedding: vec }], 5);
    expect(result).toEqual(["same"]);
  });

  it("handles opposite vectors (similarity = -1)", () => {
    const query = [1, 0, 0];
    const candidates: EmbeddingCandidate[] = [
      { songId: "opposite", embedding: [-1, 0, 0] },
      { songId: "same", embedding: [1, 0, 0] },
    ];

    const result = rankBySimilarity(query, candidates, 2);
    expect(result[0]).toBe("same");
    expect(result[1]).toBe("opposite");
  });
});
