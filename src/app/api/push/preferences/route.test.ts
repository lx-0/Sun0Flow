import { describe, it, expect, vi, beforeEach } from "vitest";
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

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { GET, PATCH } from "./route";

const seg = { params: Promise.resolve({}) };
const USER_ID = "user-123";

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init as never);
}

describe("/api/push/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("GET returns 401 when unauthorized", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await GET(makeRequest("http://localhost/api/push/preferences"), seg);
    expect(res.status).toBe(401);
  });

  it("GET returns 404 when user missing", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(makeRequest("http://localhost/api/push/preferences"), seg);
    expect(res.status).toBe(404);
  });

  it("GET returns preference fields", async () => {
    mockFindUnique.mockResolvedValue({
      pushGenerationComplete: true,
      pushNewFollower: false,
      pushSongComment: true,
    });

    const res = await GET(makeRequest("http://localhost/api/push/preferences"), seg);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      pushGenerationComplete: true,
      pushNewFollower: false,
      pushSongComment: true,
    });
  });

  it("PATCH returns 400 when no fields provided", async () => {
    const res = await PATCH(makeRequest("http://localhost/api/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }), seg);

    expect(res.status).toBe(400);
  });

  it("PATCH returns 400 when field has wrong type", async () => {
    const res = await PATCH(makeRequest("http://localhost/api/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushNewFollower: "yes" }),
    }), seg);

    expect(res.status).toBe(400);
  });

  it("PATCH updates and returns selected fields", async () => {
    mockUpdate.mockResolvedValue({
      pushGenerationComplete: false,
      pushNewFollower: true,
      pushSongComment: true,
    });

    const res = await PATCH(makeRequest("http://localhost/api/push/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pushNewFollower: true }),
    }), seg);

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { pushNewFollower: true },
      select: {
        pushGenerationComplete: true,
        pushNewFollower: true,
        pushSongComment: true,
      },
    });
  });
});
