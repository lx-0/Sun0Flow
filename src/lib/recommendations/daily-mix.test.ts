import { describe, it, expect } from "vitest";
import { seededShuffle } from "./daily-mix";

describe("seededShuffle", () => {
  it("returns a deterministic permutation for the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(items, "2026-05-09");
    const b = seededShuffle(items, "2026-05-09");
    expect(a).toEqual(b);
  });

  it("produces a different order for different seeds", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(items, "2026-05-09");
    const b = seededShuffle(items, "2026-05-10");
    expect(a).not.toEqual(b);
  });

  it("preserves all elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    const shuffled = seededShuffle(items, "seed");
    expect(shuffled.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("does not mutate the original array", () => {
    const items = [1, 2, 3];
    const original = [...items];
    seededShuffle(items, "seed");
    expect(items).toEqual(original);
  });

  it("handles empty arrays", () => {
    expect(seededShuffle([], "seed")).toEqual([]);
  });

  it("handles single-element arrays", () => {
    expect(seededShuffle([42], "seed")).toEqual([42]);
  });
});
