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

vi.mock("@/lib/songs", () => ({
  checkFavorite: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { checkFavorite, addFavorite, removeFavorite } from "@/lib/songs";
import { GET, POST, DELETE } from "./route";

const SONG_ID = "song-abc";
const USER_ID = "user-1";

function makeRequest(method: string) {
  return new NextRequest(`http://localhost/api/songs/${SONG_ID}/favorite`, { method });
}

const seg = { params: Promise.resolve({ id: SONG_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({
    userId: USER_ID,
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
});

describe("GET /api/songs/[id]/favorite", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await GET(makeRequest("GET"), seg);
    expect(res.status).toBe(401);
  });

  it("delegates to checkFavorite and returns result", async () => {
    vi.mocked(checkFavorite).mockResolvedValue({ ok: true, data: { isFavorite: true } } as never);
    const res = await GET(makeRequest("GET"), seg);
    expect(checkFavorite).toHaveBeenCalledWith(SONG_ID, USER_ID);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/songs/[id]/favorite", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await POST(makeRequest("POST"), seg);
    expect(res.status).toBe(401);
  });

  it("delegates to addFavorite and returns result", async () => {
    vi.mocked(addFavorite).mockResolvedValue({ ok: true, data: { isFavorite: true, favoriteCount: 3 } } as never);
    const res = await POST(makeRequest("POST"), seg);
    expect(addFavorite).toHaveBeenCalledWith(SONG_ID, USER_ID);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/songs/[id]/favorite", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }),
    });
    const res = await DELETE(makeRequest("DELETE"), seg);
    expect(res.status).toBe(401);
  });

  it("delegates to removeFavorite and returns result", async () => {
    vi.mocked(removeFavorite).mockResolvedValue({ ok: true, data: { isFavorite: false, favoriteCount: 0 } } as never);
    const res = await DELETE(makeRequest("DELETE"), seg);
    expect(removeFavorite).toHaveBeenCalledWith(SONG_ID, USER_ID);
    expect(res.status).toBe(200);
  });
});
