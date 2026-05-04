import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    song: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

function makeSong(overrides: Record<string, unknown> = {}) {
  return {
    id: "song-1",
    userId: "user-1",
    title: "Test Song",
    prompt: "upbeat pop",
    tags: "pop",
    generationStatus: "ready",
    audioUrl: "https://example.com/audio.mp3",
    imageUrl: null,
    duration: 120,
    lyrics: null,
    sunoModel: "V5",
    isInstrumental: false,
    errorMessage: null,
    rating: null,
    playCount: 0,
    archivedAt: null,
    parentSongId: null,
    sunoJobId: null,
    pollCount: 0,
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
    favorites: [],
    songTags: [],
    _count: { favorites: 0, variations: 0 },
    ...overrides,
  };
}

const seg = { params: Promise.resolve({}) };

function makeRequest(url: string) {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.song.findMany).mockResolvedValue([]);
  vi.mocked(prisma.song.count).mockResolvedValue(0);
});

describe("GET /api/songs", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await GET(makeRequest("http://localhost/api/songs"), seg);
    expect(res.status).toBe(401);
  });

  it("returns songs list for authenticated user", async () => {
    const songs = [makeSong()];
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs as never);
    vi.mocked(prisma.song.count).mockResolvedValue(1);

    const res = await GET(makeRequest("http://localhost/api/songs"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.songs).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.nextCursor).toBeNull();
  });

  it("enriches songs with isFavorite and counts", async () => {
    const song = makeSong({ favorites: [{ id: "fav-1" }], _count: { favorites: 3, variations: 2 } });
    vi.mocked(prisma.song.findMany).mockResolvedValue([song] as never);
    vi.mocked(prisma.song.count).mockResolvedValue(1);

    const res = await GET(makeRequest("http://localhost/api/songs"), seg);
    const data = await res.json();

    expect(data.songs[0].isFavorite).toBe(true);
    expect(data.songs[0].favoriteCount).toBe(3);
    expect(data.songs[0].variationCount).toBe(2);
    // favorites array should not be in response
    expect(data.songs[0].favorites).toBeUndefined();
  });

  it("sets nextCursor when more items exist", async () => {
    // Return limit+1 items to indicate there are more
    const songs = Array.from({ length: 21 }, (_, i) => makeSong({ id: `song-${i}` }));
    vi.mocked(prisma.song.findMany).mockResolvedValue(songs as never);
    vi.mocked(prisma.song.count).mockResolvedValue(100);

    const res = await GET(makeRequest("http://localhost/api/songs"), seg);
    const data = await res.json();

    expect(data.nextCursor).toBe("song-19"); // last item of sliced (0-19)
    expect(data.songs).toHaveLength(20);
  });

  it("applies custom limit param", async () => {
    vi.mocked(prisma.song.findMany).mockResolvedValue([]);
    vi.mocked(prisma.song.count).mockResolvedValue(0);

    await GET(makeRequest("http://localhost/api/songs?limit=5"), seg);

    expect(prisma.song.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 6 }) // limit+1
    );
  });

  it("returns 500 on database error", async () => {
    vi.mocked(prisma.song.findMany).mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest("http://localhost/api/songs"), seg);
    expect(res.status).toBe(500);
  });
});
