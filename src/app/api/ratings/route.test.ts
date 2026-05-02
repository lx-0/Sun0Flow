import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

const mockResolveUser = vi.fn();
vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: (...args: unknown[]) => mockResolveUser(...args),
}));

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rating: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    song: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { GET, POST } from "./route";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init as never);
}

const USER_ID = "user-123";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await GET(makeRequest("http://localhost/api/ratings"));
    expect(res.status).toBe(401);
  });

  it("returns all ratings for the user", async () => {
    mockFindMany.mockResolvedValue([
      { id: "r1", songId: "song-1", value: 4, createdAt: new Date(), updatedAt: new Date() },
      { id: "r2", songId: "song-2", value: 5, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await GET(makeRequest("http://localhost/api/ratings"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ratings).toHaveLength(2);
    expect(data.ratings[0].songId).toBe("song-1");
    expect(data.ratings[0].value).toBe(4);
  });

  it("filters by songId when provided", async () => {
    mockFindMany.mockResolvedValue([
      { id: "r1", songId: "song-1", value: 3, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const res = await GET(makeRequest("http://localhost/api/ratings?songId=song-1"));
    expect(res.status).toBe(200);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, songId: "song-1" },
      })
    );
  });
});

describe("POST /api/ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1", value: 4 }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when songId is missing", async () => {
    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: 4 }),
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("songId");
  });

  it("returns 400 when value is out of range", async () => {
    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1", value: 6 }),
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("value");
  });

  it("returns 400 when value is 0", async () => {
    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1", value: 0 }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when song does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "nonexistent", value: 3 }),
    }));
    expect(res.status).toBe(404);
  });

  it("creates a rating via upsert", async () => {
    mockFindUnique.mockResolvedValue({ id: "song-1" });
    const now = new Date();
    mockUpsert.mockResolvedValue({
      id: "rating-1",
      songId: "song-1",
      value: 4,
      createdAt: now,
      updatedAt: now,
    });

    const res = await POST(makeRequest("http://localhost/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1", value: 4 }),
    }));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.songId).toBe("song-1");
    expect(data.value).toBe(4);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_songId: { userId: USER_ID, songId: "song-1" } },
        create: { userId: USER_ID, songId: "song-1", value: 4 },
        update: { value: 4 },
      })
    );
  });
});
