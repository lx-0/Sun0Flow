import { describe, it, expect } from "vitest";
import { SongFilters } from "./index";

describe("SongFilters.discoverable", () => {
  it("returns base filter for ready songs with audio", () => {
    expect(SongFilters.discoverable()).toEqual({
      generationStatus: "ready",
      audioUrl: { not: null },
      archivedAt: null,
    });
  });
});

describe("SongFilters.withTagFilters", () => {
  it("returns base unchanged with no genre or mood", () => {
    const base = SongFilters.discoverable();
    expect(SongFilters.withTagFilters(base)).toEqual(base);
  });

  it("adds mood tag filter", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withTagFilters(base, undefined, "chill");
    expect(result).toMatchObject({
      tags: { contains: "chill", mode: "insensitive" },
    });
  });

  it("combines mood and genre with AND", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withTagFilters(base, "jazz", "chill");
    expect(result.AND).toEqual([
      { tags: { contains: "jazz", mode: "insensitive" } },
      { tags: { contains: "chill", mode: "insensitive" } },
    ]);
  });
});

describe("SongFilters.withTempoRange", () => {
  it("returns base unchanged with no tempo", () => {
    const base = SongFilters.discoverable();
    expect(SongFilters.withTempoRange(base)).toEqual(base);
  });

  it("adds tempo range filter", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withTempoRange(base, 80, 120);
    expect(result.tempo).toEqual({ gte: 80, lte: 120 });
  });

  it("adds only tempoMin when tempoMax is absent", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withTempoRange(base, 80);
    expect(result.tempo).toEqual({ gte: 80 });
  });

  it("adds only tempoMax when tempoMin is absent", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withTempoRange(base, undefined, 120);
    expect(result.tempo).toEqual({ lte: 120 });
  });
});

describe("SongFilters.withExcludeIds", () => {
  it("returns base unchanged with empty array", () => {
    const base = SongFilters.discoverable();
    expect(SongFilters.withExcludeIds(base, [])).toEqual(base);
  });

  it("adds notIn filter for excluded IDs", () => {
    const base = SongFilters.discoverable();
    const result = SongFilters.withExcludeIds(base, ["a", "b"]);
    expect(result.id).toEqual({ notIn: ["a", "b"] });
  });
});
