import { describe, it, expect } from "vitest";
import { parseEmbeddingVector } from "@/lib/embeddings";

describe("parseEmbeddingVector", () => {
  it("returns the array when given a valid number array", () => {
    const vec = [0.1, 0.2, 0.3];
    expect(parseEmbeddingVector(vec)).toEqual([0.1, 0.2, 0.3]);
  });

  it("returns null for empty arrays", () => {
    expect(parseEmbeddingVector([])).toBeNull();
  });

  it("returns null for non-array values", () => {
    expect(parseEmbeddingVector(null)).toBeNull();
    expect(parseEmbeddingVector(undefined)).toBeNull();
    expect(parseEmbeddingVector("string")).toBeNull();
    expect(parseEmbeddingVector(42)).toBeNull();
    expect(parseEmbeddingVector({})).toBeNull();
  });
});
