import { describe, expect, it } from "vitest";

import { buildRadioRequestUrl, removeFutureSongFromQueue } from "@/components/queue/radio-ops";
import type { QueueSong, RadioParams } from "@/components/queue/queue-context-types";

function song(id: string): QueueSong {
  return { id, title: id, audioUrl: `https://example.com/${id}.mp3`, imageUrl: null, duration: null };
}

describe("buildRadioRequestUrl", () => {
  it("includes only provided filters and limit", () => {
    const params: RadioParams = { mood: "chill", genre: null, tempoMin: 90, seedSongId: "seed-1" };
    const url = buildRadioRequestUrl("https://app.test", params, ["a", "b"], 10);
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/api/radio");
    expect(parsed.searchParams.get("mood")).toBe("chill");
    expect(parsed.searchParams.get("tempoMin")).toBe("90");
    expect(parsed.searchParams.get("seedSongId")).toBe("seed-1");
    expect(parsed.searchParams.get("excludeIds")).toBe("a,b");
    expect(parsed.searchParams.get("limit")).toBe("10");
    expect(parsed.searchParams.get("genre")).toBeNull();
    expect(parsed.searchParams.get("tempoMax")).toBeNull();
  });
});

describe("removeFutureSongFromQueue", () => {
  it("removes only matching songs that are after the current index", () => {
    const queue = [song("a"), song("b"), song("c"), song("d")];
    const next = removeFutureSongFromQueue(queue, 1, "c");
    expect(next.map((s) => s.id)).toEqual(["a", "b", "d"]);
  });

  it("does not remove current or past songs", () => {
    const queue = [song("a"), song("b"), song("c")];
    expect(removeFutureSongFromQueue(queue, 1, "b")).toEqual(queue);
    expect(removeFutureSongFromQueue(queue, 1, "a")).toEqual(queue);
  });

  it("returns original queue when song is absent", () => {
    const queue = [song("a"), song("b"), song("c")];
    expect(removeFutureSongFromQueue(queue, 1, "x")).toEqual(queue);
  });
});
