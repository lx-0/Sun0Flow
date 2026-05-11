import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    favorite: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

const USER_ID = "user-1";
const seg = { params: Promise.resolve({}) };

function makeRequest(query = "") {
  return new NextRequest(`http://localhost/api/songs/favorites${query ? `?${query}` : ""}`);
}

function makeFavoriteRow(id: string, title: string, createdAt = new Date()) {
  return {
    id,
    userId: USER_ID,
    songId: `song-${id}`,
    createdAt,
    song: {
      id: `song-${id}`,
      title,
      prompt: null,
      generationStatus: "ready",
      songTags: [],
      _count: { favorites: 1 },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.favorite.findMany).mockResolvedValue([]);
  vi.mocked(prisma.favorite.count).mockResolvedValue(0 as never);
});

describe("GET /api/songs/favorites", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no favorites", async () => {
    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.songs).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.nextCursor).toBeNull();
  });

  it("returns enriched songs with isFavorite and favoriteCount", async () => {
    const row = makeFavoriteRow("fav-1", "Test Song");
    vi.mocked(prisma.favorite.findMany).mockResolvedValue([row] as never);
    vi.mocked(prisma.favorite.count).mockResolvedValue(1 as never);

    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.songs).toHaveLength(1);
    expect(body.songs[0].isFavorite).toBe(true);
    expect(body.songs[0].favoriteCount).toBe(1);
    expect(body.total).toBe(1);
  });

  it("passes search query filter to prisma", async () => {
    vi.mocked(prisma.favorite.findMany).mockResolvedValue([]);
    vi.mocked(prisma.favorite.count).mockResolvedValue(0 as never);

    await GET(makeRequest("q=ambient"), seg);

    const call = vi.mocked(prisma.favorite.findMany).mock.calls[0][0]!;
    const songWhere = (call as { where: { song: Record<string, unknown> } }).where.song;
    expect(songWhere.OR).toBeDefined();
  });

  it("passes status filter to prisma", async () => {
    vi.mocked(prisma.favorite.findMany).mockResolvedValue([]);
    vi.mocked(prisma.favorite.count).mockResolvedValue(0 as never);

    await GET(makeRequest("status=ready"), seg);

    const call = vi.mocked(prisma.favorite.findMany).mock.calls[0][0]!;
    const songWhere = (call as { where: { song: Record<string, unknown> } }).where.song;
    expect(songWhere.generationStatus).toBe("ready");
  });

  it("sets private Cache-Control header", async () => {
    const res = await GET(makeRequest(), seg);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});
