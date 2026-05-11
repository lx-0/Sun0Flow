import { describe, it, expect } from "vitest";
import { buildDiscoverableFilter } from "./index";

describe("buildDiscoverableFilter", () => {
  it("returns publicDiscovery base with no options", () => {
    const result = buildDiscoverableFilter();
    expect(result).toEqual({
      isPublic: true,
      isHidden: false,
      archivedAt: null,
      generationStatus: "ready",
    });
  });

  it("returns discoverable base with visibility option", () => {
    const result = buildDiscoverableFilter({ visibility: "discoverable" });
    expect(result).toEqual({
      generationStatus: "ready",
      audioUrl: { not: null },
      archivedAt: null,
    });
  });

  it("composes genre and mood filters in one call", () => {
    const result = buildDiscoverableFilter({ genre: "jazz", mood: "chill" });
    expect(result.AND).toEqual([
      { tags: { contains: "jazz", mode: "insensitive" } },
      { tags: { contains: "chill", mode: "insensitive" } },
    ]);
  });

  it("composes tempo range", () => {
    const result = buildDiscoverableFilter({ tempoMin: 80, tempoMax: 140 });
    expect(result.tempo).toEqual({ gte: 80, lte: 140 });
  });

  it("composes excludeIds", () => {
    const result = buildDiscoverableFilter({ excludeIds: ["x", "y"] });
    expect(result.id).toEqual({ notIn: ["x", "y"] });
  });

  it("composes all options together", () => {
    const result = buildDiscoverableFilter({
      visibility: "discoverable",
      genre: "rock",
      tempoMin: 100,
      excludeIds: ["z"],
    });
    expect(result.generationStatus).toBe("ready");
    expect(result.audioUrl).toEqual({ not: null });
    expect(result.tags).toEqual({ contains: "rock", mode: "insensitive" });
    expect(result.tempo).toEqual({ gte: 100 });
    expect(result.id).toEqual({ notIn: ["z"] });
  });
});
