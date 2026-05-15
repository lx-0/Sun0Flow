import { describe, it, expect } from "vitest";
import { formatSong } from "./format";
import type { SongRow } from "./format";

describe("formatSong", () => {
  const baseSong: SongRow = {
    id: "song-1",
    title: "Test Song",
    tags: "rock, upbeat",
    imageUrl: "https://example.com/img.png",
    duration: 180,
    audioUrl: "https://example.com/audio.mp3",
    createdAt: new Date("2026-01-15T10:30:00Z"),
    rating: 4,
    playCount: 42,
    isFavorite: true,
  };

  it("converts Date to ISO string", () => {
    const result = formatSong(baseSong);
    expect(result.createdAt).toBe("2026-01-15T10:30:00.000Z");
  });

  it("preserves all fields", () => {
    const result = formatSong(baseSong);
    expect(result).toEqual({
      id: "song-1",
      title: "Test Song",
      tags: "rock, upbeat",
      imageUrl: "https://example.com/img.png",
      duration: 180,
      audioUrl: "https://example.com/audio.mp3",
      createdAt: "2026-01-15T10:30:00.000Z",
      rating: 4,
      playCount: 42,
      isFavorite: true,
    });
  });

  it("handles null fields", () => {
    const result = formatSong({
      ...baseSong,
      title: null,
      tags: null,
      imageUrl: null,
      duration: null,
      audioUrl: null,
      rating: null,
    });
    expect(result.title).toBeNull();
    expect(result.tags).toBeNull();
    expect(result.rating).toBeNull();
  });
});
