import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlaybackState } from "./playback-state";

describe("loadPlaybackState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when persisted state has no song", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ state: {} }),
      })
    );

    await expect(loadPlaybackState()).resolves.toBeNull();
  });

  it("normalizes restore state from persisted payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          state: {
            song: {
              id: "song-1",
              title: "Song 1",
              audioUrl: "https://example.com/audio.mp3",
              imageUrl: null,
              duration: 180,
            },
            queue: [
              {
                id: "song-2",
                title: "Song 2",
                audioUrl: "https://example.com/2.mp3",
                imageUrl: null,
                duration: 120,
              },
              {
                id: "song-1",
                title: "Song 1",
                audioUrl: "https://example.com/1.mp3",
                imageUrl: null,
                duration: 180,
              },
            ],
            position: 42,
            volume: 0.7,
            shuffleVersions: true,
            shuffle: true,
            repeat: "repeat-all",
            muted: true,
            eqGains: [1, 2, 3, 4, 5],
            eqSpeed: 1.1,
            eqPitch: -2,
          },
        }),
      })
    );

    const restored = await loadPlaybackState();

    expect(restored).not.toBeNull();
    expect(restored?.currentIndex).toBe(1);
    expect(restored?.duration).toBe(180);
    expect(restored?.position).toBe(42);
    expect(restored?.volume).toBe(0.7);
    expect(restored?.shuffleVersions).toBe(true);
    expect(restored?.shuffle).toBe(true);
    expect(restored?.repeat).toBe("repeat-all");
    expect(restored?.muted).toBe(true);
    expect(restored?.eqSettings).toEqual({ gains: [1, 2, 3, 4, 5], speed: 1.1, pitch: -2 });
    expect(restored?.initialSrc).toContain("song-1");
  });
});
