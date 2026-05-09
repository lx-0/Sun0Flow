import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSongCount = vi.fn();
const mockSongAggregate = vi.fn();
const mockSongFindMany = vi.fn();
const mockPlaylistCount = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      count: (...args: unknown[]) => mockSongCount(...args),
      aggregate: (...args: unknown[]) => mockSongAggregate(...args),
      findMany: (...args: unknown[]) => mockSongFindMany(...args),
    },
    playlist: {
      count: (...args: unknown[]) => mockPlaylistCount(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import { getDashboardStats } from "./index";

describe("getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates all stats into a single result", async () => {
    mockSongCount
      .mockResolvedValueOnce(42)   // totalSongs
      .mockResolvedValueOnce(10)   // totalFavorites
      .mockResolvedValueOnce(5)    // songsThisWeek
      .mockResolvedValueOnce(12);  // songsThisMonth
    mockPlaylistCount.mockResolvedValueOnce(3);
    mockSongAggregate.mockResolvedValueOnce({
      _avg: { rating: 4.27 },
      _count: { rating: 15 },
    });
    mockQueryRaw.mockResolvedValueOnce([
      { tag: "jazz", count: BigInt(8) },
      { tag: "chill", count: BigInt(5) },
    ]);
    mockSongFindMany.mockResolvedValueOnce([
      { id: "s1", title: "Song A", imageUrl: null, tags: "jazz", duration: 180, createdAt: new Date() },
    ]);

    const result = await getDashboardStats("user-1");

    expect(result.totalSongs).toBe(42);
    expect(result.totalFavorites).toBe(10);
    expect(result.totalPlaylists).toBe(3);
    expect(result.songsThisWeek).toBe(5);
    expect(result.songsThisMonth).toBe(12);
    expect(result.averageRating).toBe(4.3);
    expect(result.ratedSongsCount).toBe(15);
    expect(result.topTags).toEqual([
      { tag: "jazz", count: 8 },
      { tag: "chill", count: 5 },
    ]);
    expect(result.recentSongs).toHaveLength(1);
  });

  it("returns null averageRating when no songs are rated", async () => {
    mockSongCount.mockResolvedValue(0);
    mockPlaylistCount.mockResolvedValueOnce(0);
    mockSongAggregate.mockResolvedValueOnce({
      _avg: { rating: null },
      _count: { rating: 0 },
    });
    mockQueryRaw.mockResolvedValueOnce([]);
    mockSongFindMany.mockResolvedValueOnce([]);

    const result = await getDashboardStats("user-2");

    expect(result.averageRating).toBeNull();
    expect(result.ratedSongsCount).toBe(0);
  });

  it("filters out empty tags from raw SQL results", async () => {
    mockSongCount.mockResolvedValue(1);
    mockPlaylistCount.mockResolvedValueOnce(0);
    mockSongAggregate.mockResolvedValueOnce({
      _avg: { rating: null },
      _count: { rating: 0 },
    });
    mockQueryRaw.mockResolvedValueOnce([
      { tag: "", count: BigInt(3) },
      { tag: "rock", count: BigInt(2) },
    ]);
    mockSongFindMany.mockResolvedValueOnce([]);

    const result = await getDashboardStats("user-3");

    expect(result.topTags).toEqual([{ tag: "rock", count: 2 }]);
  });
});
