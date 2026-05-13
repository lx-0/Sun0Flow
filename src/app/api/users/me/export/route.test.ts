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

const mockAcquireRateLimitSlot = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  acquireRateLimitSlot: (...args: unknown[]) => mockAcquireRateLimitSlot(...args),
}));

const mockExportGdprZip = vi.fn();
vi.mock("@/lib/data-export", () => ({
  exportGdprZip: (...args: unknown[]) => mockExportGdprZip(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { GET } from "./route";

const USER_ID = "user-123";
const seg = { params: Promise.resolve({}) };

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(url, init as never);
}

describe("GET /api/users/me/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUser.mockResolvedValue({ userId: USER_ID, isApiKey: false, isAdmin: false, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    mockResolveUser.mockResolvedValue({ userId: null, isApiKey: false, isAdmin: false, error: errorResponse });

    const res = await GET(makeRequest("http://localhost/api/users/me/export"), seg);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockAcquireRateLimitSlot.mockResolvedValue({
      acquired: false,
      status: { limit: 1, remaining: 0, resetAt: new Date(Date.now() + 10_000).toISOString() },
    });

    const res = await GET(makeRequest("http://localhost/api/users/me/export"), seg);
    expect(res.status).toBe(429);
  });

  it("returns zip payload and rate-limit headers on success", async () => {
    mockAcquireRateLimitSlot.mockResolvedValue({
      acquired: true,
      status: { limit: 1, remaining: 0, resetAt: "2026-05-13T12:00:00.000Z" },
    });
    const zipBuffer = Buffer.from("fake-zip");
    mockExportGdprZip.mockResolvedValue({
      ok: true,
      data: { zipBuffer, filename: "export.zip" },
    });

    const res = await GET(makeRequest("http://localhost/api/users/me/export"), seg);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("export.zip");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("2026-05-13T12:00:00.000Z");
    expect(mockExportGdprZip).toHaveBeenCalledWith(USER_ID);
  });
});
