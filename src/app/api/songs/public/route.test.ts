import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

const mockAnonFindMany = vi.fn().mockResolvedValue([]);
const mockAnonCreate = vi.fn().mockResolvedValue({ id: "rl-1" });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    song: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    anonRateLimitEntry: {
      findMany: (...args: unknown[]) => mockAnonFindMany(...args),
      create: (...args: unknown[]) => mockAnonCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        anonRateLimitEntry: {
          findMany: (...args: unknown[]) => mockAnonFindMany(...args),
          create: (...args: unknown[]) => mockAnonCreate(...args),
        },
      }),
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

// Bypass cache for tests
vi.mock("@/lib/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cache")>();
  return {
    ...actual,
    cached: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  };
});

import { prisma } from "@/lib/prisma";

function makePublicSong(overrides: Record<string, unknown> = {}) {
  return {
    id: "song-1",
    title: "Public Song",
    tags: "pop upbeat",
    imageUrl: "https://example.com/art.jpg",
    playCount: 42,
    createdAt: new Date("2026-03-01"),
    user: { name: "Test User", username: "testuser" },
    ...overrides,
  };
}

function makeRequest(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.song.findMany).mockResolvedValue([]);
  vi.mocked(prisma.song.count).mockResolvedValue(0);
});

describe("GET /api/songs/public", () => {
  it("returns 200 with empty list when no public songs", async () => {
    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.songs).toHaveLength(0);
    expect(data.pagination.total).toBe(0);
  });

  it("returns shaped public song data without private user fields", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([makePublicSong()] as never);
    vi.mocked(prisma.song.count).mockResolvedValue(1);

    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.songs).toHaveLength(1);
    const song = data.songs[0];
    expect(song.id).toBe("song-1");
    expect(song.title).toBe("Public Song");
    expect(song.creatorDisplayName).toBe("Test User");
    expect(song.albumArtUrl).toBe("https://example.com/art.jpg");
    expect(song.playCount).toBe(42);
    expect(song.createdAt).toBeDefined();
    // Should not expose email, userId, or internal IDs
    expect(song.email).toBeUndefined();
    expect(song.userId).toBeUndefined();
  });

  it("falls back to username when name is null", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      makePublicSong({ user: { name: null, username: "fallbackuser" } }),
    ] as never);
    vi.mocked(prisma.song.count).mockResolvedValue(1);

    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    const data = await res.json();
    expect(data.songs[0].creatorDisplayName).toBe("fallbackuser");
  });

  it("falls back to Anonymous when both name and username are null", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([
      makePublicSong({ user: { name: null, username: null } }),
    ] as never);
    vi.mocked(prisma.song.count).mockResolvedValue(1);

    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    const data = await res.json();
    expect(data.songs[0].creatorDisplayName).toBe("Anonymous");
  });

  it("respects limit and offset pagination params", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?limit=10&offset=20"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 })
    );
  });

  it("clamps limit to 100", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?limit=200"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }) // default fallback
    );
  });

  it("applies genre filter via tags contains", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?genre=jazz"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { contains: "jazz", mode: "insensitive" },
        }),
      })
    );
  });

  it("applies mood filter via tags contains", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?mood=chill"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tags: { contains: "chill", mode: "insensitive" },
        }),
      })
    );
  });

  it("applies AND logic when both genre and mood are provided", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?genre=jazz&mood=chill"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { tags: { contains: "jazz", mode: "insensitive" } },
            { tags: { contains: "chill", mode: "insensitive" } },
          ],
        }),
      })
    );
  });

  it("sorts by playCount desc for sort=popular", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?sort=popular"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { playCount: "desc" } })
    );
  });

  it("sorts by createdAt desc for sort=newest", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?sort=newest"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  it("applies 30-day window and playCount sort for sort=trending", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?sort=trending"));

    const call = vi.mocked(prisma.song.findMany).mock.calls[0][0] as {
      where: { createdAt?: { gte: Date } };
      orderBy: unknown;
    };
    expect(call.orderBy).toEqual({ playCount: "desc" });
    expect(call.where.createdAt?.gte).toBeInstanceOf(Date);
  });

  it("applies text search with OR on title and tags", async () => {
    await GET(makeRequest("http://localhost/api/songs/public?q=rock"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { title: { contains: "rock", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  it("filters only public, non-hidden, ready, non-archived songs", async () => {
    await GET(makeRequest("http://localhost/api/songs/public"));

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublic: true,
          isHidden: false,
          archivedAt: null,
          generationStatus: "ready",
        }),
      })
    );
  });

  it("returns pagination metadata", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => makePublicSong({ id: `song-${i}` })) as never
    );
    vi.mocked(prisma.song.count).mockResolvedValue(25);

    const res = await GET(makeRequest("http://localhost/api/songs/public?limit=5&offset=0"));
    const data = await res.json();

    expect(data.pagination).toEqual({
      total: 25,
      limit: 5,
      offset: 0,
      hasMore: true,
    });
  });

  it("hasMore is false when offset+limit >= total", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => makePublicSong({ id: `song-${i}` })) as never
    );
    vi.mocked(prisma.song.count).mockResolvedValue(25);

    const res = await GET(makeRequest("http://localhost/api/songs/public?limit=5&offset=20"));
    const data = await res.json();

    expect(data.pagination.hasMore).toBe(false);
  });

  it("returns 500 on database error", async () => {
    vi.mocked(prisma.song.findMany).mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    expect(res.status).toBe(500);
  });

  it("sets public Cache-Control header", async () => {
    const res = await GET(makeRequest("http://localhost/api/songs/public"));
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});
