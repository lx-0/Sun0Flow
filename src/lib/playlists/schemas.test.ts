import { describe, expect, it } from "vitest";
import {
  addPlaylistSongBody,
  reorderPlaylistSongsBody,
  updatePlaylistBody,
} from "@/lib/playlists/schemas";

describe("playlists request schemas", () => {
  it("accepts name or description for update payload", () => {
    expect(updatePlaylistBody.safeParse({ name: "Roadtrip" }).success).toBe(true);
    expect(
      updatePlaylistBody.safeParse({ description: "Synthwave set" }).success,
    ).toBe(true);
  });

  it("rejects empty update payload", () => {
    expect(updatePlaylistBody.safeParse({}).success).toBe(false);
  });

  it("validates add song payload", () => {
    expect(addPlaylistSongBody.safeParse({ songId: "song_1" }).success).toBe(true);
    expect(addPlaylistSongBody.safeParse({ songId: "" }).success).toBe(false);
  });

  it("validates reorder payload", () => {
    expect(
      reorderPlaylistSongsBody.safeParse({ songIds: ["song_1", "song_2"] }).success,
    ).toBe(true);
    expect(reorderPlaylistSongsBody.safeParse({ songIds: ["" ] }).success).toBe(
      false,
    );
  });
});
