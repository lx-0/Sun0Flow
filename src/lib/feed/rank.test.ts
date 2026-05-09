import { describe, it, expect } from "vitest";
import {
  rankAnonymousFeed,
  rankPersonalizedFeed,
  toFeedItem,
  type SongRow,
} from "./rank";

function makeSong(overrides: Partial<SongRow> = {}): SongRow {
  return {
    id: "song-1",
    userId: "user-1",
    title: "Test Song",
    tags: "rock, indie",
    imageUrl: null,
    audioUrl: "https://audio.test/1.mp3",
    duration: 180,
    rating: 4,
    playCount: 100,
    downloadCount: 10,
    publicSlug: "test-song",
    createdAt: new Date("2025-04-01"),
    user: { id: "user-1", name: "Alice", username: "alice" },
    ...overrides,
  };
}

describe("toFeedItem", () => {
  it("maps song row to feed item", () => {
    const song = makeSong();
    const item = toFeedItem(song, "trending", "Trending");

    expect(item.id).toBe("song-1");
    expect(item.reason).toBe("trending");
    expect(item.reasonLabel).toBe("Trending");
    expect(item.creatorDisplayName).toBe("Alice");
    expect(item.createdAt).toBe(song.createdAt.toISOString());
  });

  it("falls back to username for display name", () => {
    const song = makeSong({ user: { id: "u", name: null, username: "bob" } });
    expect(toFeedItem(song, "trending", "T").creatorDisplayName).toBe("bob");
  });

  it("falls back to Unknown Artist", () => {
    const song = makeSong({
      user: { id: "u", name: null, username: null },
    });
    expect(toFeedItem(song, "trending", "T").creatorDisplayName).toBe(
      "Unknown Artist",
    );
  });
});

describe("rankAnonymousFeed", () => {
  it("interleaves trending and new releases", () => {
    const trending = [
      makeSong({ id: "t1", playCount: 200 }),
      makeSong({ id: "t2", playCount: 100 }),
    ];
    const newReleases = [
      makeSong({ id: "n1", createdAt: new Date("2025-04-10") }),
      makeSong({ id: "n2", createdAt: new Date("2025-04-09") }),
    ];

    const result = rankAnonymousFeed(trending, newReleases);

    expect(result).toHaveLength(4);
    expect(result[0].reason).toBe("trending");
    expect(result[1].reason).toBe("new_release");
    expect(result[2].reason).toBe("trending");
    expect(result[3].reason).toBe("new_release");
  });

  it("deduplicates songs in both pools", () => {
    const shared = makeSong({ id: "shared" });
    const result = rankAnonymousFeed([shared], [shared]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("shared");
  });

  it("returns empty for empty inputs", () => {
    expect(rankAnonymousFeed([], [])).toEqual([]);
  });

  it("handles uneven pool sizes", () => {
    const trending = [makeSong({ id: "t1" })];
    const newReleases = [
      makeSong({ id: "n1" }),
      makeSong({ id: "n2" }),
      makeSong({ id: "n3" }),
    ];

    const result = rankAnonymousFeed(trending, newReleases);
    expect(result).toHaveLength(4);
  });
});

describe("rankPersonalizedFeed", () => {
  it("prioritizes followed artists above trending", () => {
    const followed = makeSong({ id: "f1", userId: "artist-1" });
    const trending = makeSong({ id: "t1", playCount: 9999 });

    const result = rankPersonalizedFeed({
      followedSongs: [followed],
      trendingPool: [trending],
      newReleases: [],
      followedNames: new Map([["artist-1", "Favorite Artist"]]),
      tasteProfile: new Map(),
    });

    expect(result[0].id).toBe("f1");
    expect(result[0].reason).toBe("followed_artist");
    expect(result[0].reasonLabel).toContain("Favorite Artist");
  });

  it("promotes new releases with high affinity to recommended", () => {
    const song = makeSong({ id: "nr1", tags: "rock, indie" });

    const result = rankPersonalizedFeed({
      followedSongs: [],
      trendingPool: [],
      newReleases: [song],
      followedNames: new Map(),
      tasteProfile: new Map([
        ["rock", 3],
        ["indie", 2],
      ]),
    });

    expect(result[0].reason).toBe("recommended");
    expect(result[0].reasonLabel).toBe("Recommended for you");
  });

  it("labels low-affinity new releases as new_release", () => {
    const song = makeSong({ id: "nr1", tags: "classical" });

    const result = rankPersonalizedFeed({
      followedSongs: [],
      trendingPool: [],
      newReleases: [song],
      followedNames: new Map(),
      tasteProfile: new Map([["rock", 3]]),
    });

    expect(result[0].reason).toBe("new_release");
  });

  it("deduplicates across all pools", () => {
    const song = makeSong({ id: "dup", userId: "artist-1" });

    const result = rankPersonalizedFeed({
      followedSongs: [song],
      trendingPool: [song],
      newReleases: [song],
      followedNames: new Map([["artist-1", "A"]]),
      tasteProfile: new Map(),
    });

    expect(result).toHaveLength(1);
  });

  it("treats empty taste profile as trending fallback ranking", () => {
    const song = makeSong({ id: "nr1", tags: "rock, indie" });

    const result = rankPersonalizedFeed({
      followedSongs: [],
      trendingPool: [],
      newReleases: [song],
      followedNames: new Map(),
      tasteProfile: new Map(),
    });

    expect(result[0].reason).toBe("new_release");
  });
});
