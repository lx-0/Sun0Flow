import { describe, it, expect } from "vitest";
import { curateResults } from ".";

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
