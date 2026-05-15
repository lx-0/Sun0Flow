import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
vi.mock("@/lib/auth", () => ({
  resolveUser: (...args: unknown[]) => mockResolveUser(...args),
}));

const mockPlaybackFindUnique = vi.fn();
const mockPlaybackUpsert = vi.fn();
const mockSongFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    playbackState: {
      findUnique: (...args: unknown[]) => mockPlaybackFindUnique(...args),
      upsert: (...args: unknown[]) => mockPlaybackUpsert(...args),
    },
    song: {
      findFirst: (...args: unknown[]) => mockSongFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { GET, PUT } from "./route";

const seg = { params: Promise.resolve({}) };
const USER_ID = "user-123";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init as never);
}

describe("GET /api/user/playback-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await GET(makeRequest("http://localhost/api/user/playback-state"), seg);
    expect(res.status).toBe(401);
  });

  it("returns null state when missing", async () => {
    mockPlaybackFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest("http://localhost/api/user/playback-state"), seg);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBeNull();
  });
});

describe("PUT /api/user/playback-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("returns 400 for invalid payload", async () => {
    const res = await PUT(makeRequest("http://localhost/api/user/playback-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "", position: -1, queue: "invalid" }),
    }), seg);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when song does not belong to user", async () => {
    mockSongFindFirst.mockResolvedValue(null);

    const res = await PUT(makeRequest("http://localhost/api/user/playback-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: "song-1", position: 10, queue: [] }),
    }), seg);

    expect(res.status).toBe(404);
  });

  it("upserts playback state with normalized values", async () => {
    mockSongFindFirst.mockResolvedValue({ id: "song-1" });
    mockPlaybackUpsert.mockResolvedValue({ id: "state-1" });

    const res = await PUT(makeRequest("http://localhost/api/user/playback-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songId: "song-1",
        position: 5,
        queue: ["song-1"],
        volume: 3,
      }),
    }), seg);

    expect(res.status).toBe(200);
    expect(mockPlaybackUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: USER_ID,
          songId: "song-1",
          position: 5,
          queue: ["song-1"],
          volume: 1,
          repeat: "off",
          shuffleVersions: false,
          shuffle: false,
          muted: false,
          eqGains: [0, 0, 0, 0, 0],
          eqSpeed: 1,
          eqPitch: 0,
        }),
        update: expect.objectContaining({
          songId: "song-1",
          position: 5,
          queue: ["song-1"],
          volume: 1,
          repeat: "off",
          shuffleVersions: false,
          shuffle: false,
          muted: false,
          eqGains: [0, 0, 0, 0, 0],
          eqSpeed: 1,
          eqPitch: 0,
        }),
      })
    );
  });
});
