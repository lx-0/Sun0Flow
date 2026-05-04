import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

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
    playlist: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  cached: vi.fn((_key: string, fetcher: () => Promise<unknown>) => fetcher()),
  cacheKey: vi.fn((...parts: string[]) => parts.join(":")),
  invalidateByPrefix: vi.fn(),
  CacheTTL: { PLAYLIST: 30000 },
  CacheControl: { privateShort: "private, max-age=10, must-revalidate" },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({
  recordActivity: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const basePlaylist = {
  id: "pl-1",
  userId: "user-1",
  name: "My Playlist",
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { songs: 0 },
};

const seg = { params: Promise.resolve({}) };

function makeRequest(body?: Record<string, unknown>): NextRequest {
  if (body) {
    return new NextRequest("http://localhost/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  return new NextRequest("http://localhost/api/playlists");
}

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
  vi.mocked(prisma.playlist.findMany).mockResolvedValue([]);
  vi.mocked(prisma.playlist.count).mockResolvedValue(0);
});

describe("GET /api/playlists", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(401);
  });

  it("returns playlists for authenticated user", async () => {
    vi.mocked(prisma.playlist.findMany).mockResolvedValue([basePlaylist] as never);

    const res = await GET(makeRequest(), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.playlists).toHaveLength(1);
    expect(data.playlists[0].name).toBe("My Playlist");
  });

  it("returns 500 on error", async () => {
    vi.mocked(prisma.playlist.findMany).mockRejectedValue(new Error("DB error"));

    const res = await GET(makeRequest(), seg);
    expect(res.status).toBe(500);
  });
});

describe("POST /api/playlists", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await POST(makeRequest({ name: "Test" }), seg);
    expect(res.status).toBe(401);
  });

  it("creates a playlist successfully", async () => {
    vi.mocked(prisma.playlist.create).mockResolvedValue(basePlaylist as never);

    const res = await POST(makeRequest({ name: "My Playlist", description: "A great playlist" }), seg);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.playlist.name).toBe("My Playlist");
  });

  it("returns 400 when name is missing", async () => {
    const res = await POST(makeRequest({ description: "No name" }), seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when name is empty", async () => {
    const res = await POST(makeRequest({ name: "   " }), seg);
    expect(res.status).toBe(400);
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const res = await POST(makeRequest({ name: "a".repeat(101) }), seg);
    expect(res.status).toBe(400);
  });

  it("returns 400 when description exceeds 1000 characters", async () => {
    const res = await POST(makeRequest({ name: "Valid Name", description: "d".repeat(1001) }), seg);
    expect(res.status).toBe(400);
  });

  it("returns 400 when max playlists limit reached", async () => {
    vi.mocked(prisma.playlist.count).mockResolvedValue(50);

    const res = await POST(makeRequest({ name: "New Playlist" }), seg);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Maximum");
  });

  it("returns 500 on error", async () => {
    vi.mocked(prisma.playlist.create).mockRejectedValue(new Error("DB error"));

    const res = await POST(makeRequest({ name: "Good Name" }), seg);
    expect(res.status).toBe(500);
  });
});
