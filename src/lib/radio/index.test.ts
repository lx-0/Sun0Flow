import { describe, it, expect } from "vitest";
import { buildRadioFilter, curateResults } from "./helpers";

/* ── buildRadioFilter ─────────────────────────────────────────── */

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

/* ── curateResults ────────────────────────────────────────────── */

type RadioSong = Parameters<typeof curateResults>[0][number];

function song(id: string, audioUrl: string | null = "https://audio.test/a.mp3"): RadioSong {
  return { id, title: `Song ${id}`, audioUrl, imageUrl: null, duration: 180, lyrics: null, tags: null };
}

describe("curateResults", () => {
  it("merges user and public songs", () => {
    const result = curateResults([song("1")], [song("2")], 10);
    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id).sort();
    expect(ids).toEqual(["1", "2"]);
  });

  it("deduplicates by id (user songs take priority)", () => {
    const result = curateResults([song("1")], [song("1")], 10);
    expect(result).toHaveLength(1);
  });

  it("filters out songs with null audioUrl", () => {
    const result = curateResults([song("1", null)], [song("2")], 10);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("respects limit", () => {
    const user = Array.from({ length: 10 }, (_, i) => song(`u${i}`));
    const pub = Array.from({ length: 10 }, (_, i) => song(`p${i}`));
    const result = curateResults(user, pub, 5);
    expect(result).toHaveLength(5);
  });

  it("returns empty array when no valid songs", () => {
    const result = curateResults([], [], 10);
    expect(result).toEqual([]);
  });
});
