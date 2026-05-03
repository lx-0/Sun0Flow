import { describe, it, expect } from "vitest";
import { buildRadioFilter } from "./build-filter";

describe("buildRadioFilter", () => {
  const baseCriteria = { mood: "", genre: "", excludeIds: [] as string[] };

  it("returns base filter with no criteria", () => {
    const filter = buildRadioFilter(baseCriteria);
    expect(filter).toEqual({
      generationStatus: "ready",
      audioUrl: { not: null },
      archivedAt: null,
    });
  });

  it("adds mood tag filter", () => {
    const filter = buildRadioFilter({ ...baseCriteria, mood: "chill" });
    expect(filter).toMatchObject({
      tags: { contains: "chill", mode: "insensitive" },
    });
  });

  it("combines mood and genre with AND", () => {
    const filter = buildRadioFilter({
      ...baseCriteria,
      mood: "chill",
      genre: "jazz",
    });
    expect(filter.AND).toEqual([
      { tags: { contains: "chill", mode: "insensitive" } },
      { tags: { contains: "jazz", mode: "insensitive" } },
    ]);
  });

  it("adds tempo range filter", () => {
    const filter = buildRadioFilter({
      ...baseCriteria,
      tempoMin: 80,
      tempoMax: 120,
    });
    expect(filter.tempo).toEqual({ gte: 80, lte: 120 });
  });

  it("adds only tempoMin when tempoMax is absent", () => {
    const filter = buildRadioFilter({ ...baseCriteria, tempoMin: 80 });
    expect(filter.tempo).toEqual({ gte: 80 });
  });

  it("adds exclude IDs filter", () => {
    const filter = buildRadioFilter({
      ...baseCriteria,
      excludeIds: ["a", "b"],
    });
    expect(filter.id).toEqual({ notIn: ["a", "b"] });
  });

  it("omits excludeIds filter when array is empty", () => {
    const filter = buildRadioFilter(baseCriteria);
    expect(filter.id).toBeUndefined();
  });
});
