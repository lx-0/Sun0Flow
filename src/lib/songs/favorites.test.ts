import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  env: {},
}));

const mockSongFindFirst = vi.fn();
const mockFavoriteFindUnique = vi.fn();
const mockFavoriteUpsert = vi.fn();
const mockFavoriteDeleteMany = vi.fn();
const mockFavoriteCount = vi.fn();
const mockFavoriteFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findFirst: (...args: unknown[]) => mockSongFindFirst(...args),
    },
    favorite: {
      findUnique: (...args: unknown[]) => mockFavoriteFindUnique(...args),
      upsert: (...args: unknown[]) => mockFavoriteUpsert(...args),
      deleteMany: (...args: unknown[]) => mockFavoriteDeleteMany(...args),
      count: (...args: unknown[]) => mockFavoriteCount(...args),
      findMany: (...args: unknown[]) => mockFavoriteFindMany(...args),
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  recordActivity: vi.fn(),
}));

vi.mock("@/lib/pagination", () => ({
  cursorPaginate: vi.fn((items: unknown[], limit: number) => ({
    items: items.slice(0, limit),
    nextCursor: items.length > limit ? "next" : null,
  })),
}));

import {
  findAccessibleSong,
  checkFavorite,
  addFavorite,
  removeFavorite,
  listFavorites,
} from "./favorites";
import { invalidateByPrefix } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";

const SONG = { id: "song-1", userId: "user-1", title: "Test Song" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findAccessibleSong", () => {
  it("returns song when user owns it", async () => {
    mockSongFindFirst.mockResolvedValue(SONG);
    const result = await findAccessibleSong("song-1", "user-1");
    expect(result).toEqual(SONG);
    expect(mockSongFindFirst).toHaveBeenCalledWith({
      where: {
        id: "song-1",
        OR: [{ userId: "user-1" }, { isPublic: true }],
      },
    });
  });

  it("returns null when song is inaccessible", async () => {
    mockSongFindFirst.mockResolvedValue(null);
    const result = await findAccessibleSong("song-1", "user-2");
    expect(result).toBeNull();
  });
});

describe("checkFavorite", () => {
  it("returns isFavorite true when favorite exists", async () => {
    mockSongFindFirst.mockResolvedValue(SONG);
    mockFavoriteFindUnique.mockResolvedValue({ id: "fav-1" });

    const result = await checkFavorite("song-1", "user-1");
    expect(result).toEqual({ ok: true, data: { isFavorite: true } });
  });

  it("returns isFavorite false when no favorite", async () => {
    mockSongFindFirst.mockResolvedValue(SONG);
    mockFavoriteFindUnique.mockResolvedValue(null);

    const result = await checkFavorite("song-1", "user-1");
    expect(result).toEqual({ ok: true, data: { isFavorite: false } });
  });

  it("returns not found when song inaccessible", async () => {
    mockSongFindFirst.mockResolvedValue(null);

    const result = await checkFavorite("song-1", "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("addFavorite", () => {
  it("creates favorite and returns count", async () => {
    mockSongFindFirst.mockResolvedValue(SONG);
    mockFavoriteUpsert.mockResolvedValue({ id: "fav-1" });
    mockFavoriteCount.mockResolvedValue(5);

    const result = await addFavorite("song-1", "user-1");
    expect(result).toEqual({
      ok: true,
      data: { isFavorite: true, favoriteCount: 5, favoriteId: "fav-1" },
    });
    expect(invalidateByPrefix).toHaveBeenCalledWith("dashboard-stats:user-1");
    expect(recordActivity).toHaveBeenCalledWith({
      userId: "user-1",
      type: "song_favorited",
      songId: "song-1",
    });
  });

  it("returns not found for inaccessible song", async () => {
    mockSongFindFirst.mockResolvedValue(null);

    const result = await addFavorite("song-1", "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(mockFavoriteUpsert).not.toHaveBeenCalled();
  });
});

describe("removeFavorite", () => {
  it("deletes favorite and returns count", async () => {
    mockSongFindFirst.mockResolvedValue(SONG);
    mockFavoriteDeleteMany.mockResolvedValue({ count: 1 });
    mockFavoriteCount.mockResolvedValue(4);

    const result = await removeFavorite("song-1", "user-1");
    expect(result).toEqual({
      ok: true,
      data: { isFavorite: false, favoriteCount: 4 },
    });
    expect(invalidateByPrefix).toHaveBeenCalledWith("dashboard-stats:user-1");
  });

  it("returns not found for inaccessible song", async () => {
    mockSongFindFirst.mockResolvedValue(null);

    const result = await removeFavorite("song-1", "user-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
    expect(mockFavoriteDeleteMany).not.toHaveBeenCalled();
  });
});

const FAV_ROW = {
  id: "fav-1",
  userId: "user-1",
  songId: "song-1",
  createdAt: new Date("2024-01-01"),
  song: {
    ...SONG,
    prompt: null,
    songTags: [],
    _count: { favorites: 3 },
  },
};

describe("listFavorites", () => {
  it("returns paginated favorites with enriched fields", async () => {
    mockFavoriteFindMany.mockResolvedValue([FAV_ROW]);
    mockFavoriteCount.mockResolvedValue(1);

    const result = await listFavorites({ userId: "user-1" });

    expect(result.total).toBe(1);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].isFavorite).toBe(true);
    expect(result.songs[0].favoriteCount).toBe(3);
    expect(result.songs[0].favoritedAt).toEqual(new Date("2024-01-01"));
    expect(result.nextCursor).toBeNull();
  });

  it("forwards cursor to Prisma query", async () => {
    mockFavoriteFindMany.mockResolvedValue([]);
    mockFavoriteCount.mockResolvedValue(0);

    await listFavorites({ userId: "user-1", cursor: "fav-cursor-1" });

    expect(mockFavoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "fav-cursor-1" }, skip: 1 }),
    );
  });

  it("applies search filter as OR on title and prompt", async () => {
    mockFavoriteFindMany.mockResolvedValue([]);
    mockFavoriteCount.mockResolvedValue(0);

    await listFavorites({ userId: "user-1", search: "rock" });

    expect(mockFavoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          song: expect.objectContaining({
            OR: [
              { title: { contains: "rock", mode: "insensitive" } },
              { prompt: { contains: "rock", mode: "insensitive" } },
            ],
          }),
        }),
      }),
    );
  });

  it("orders by title_az when sortBy=title_az", async () => {
    mockFavoriteFindMany.mockResolvedValue([]);
    mockFavoriteCount.mockResolvedValue(0);

    await listFavorites({ userId: "user-1", sortBy: "title_az" });

    expect(mockFavoriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { song: { title: { sort: "asc", nulls: "last" } } },
      }),
    );
  });
});
