import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/sunoapi", () => ({
  resolveUserApiKey: vi.fn(),
  getRemainingCredits: vi.fn(),
  SunoApiError: class SunoApiError extends Error {
    status: number;

    constructor(status: number, message = "Suno API error") {
      super(message);
      this.name = "SunoApiError";
      this.status = status;
    }
  },
}));

import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey, getRemainingCredits, SunoApiError } from "@/lib/sunoapi";
import { GET } from "./route";

const seg = { params: Promise.resolve({}) } as never;

describe("GET /api/suno/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveUser).mockResolvedValue({
      userId: "user-1",
      isApiKey: false,
      isAdmin: false,
      error: null,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/suno/status"), seg);
    expect(res.status).toBe(401);
  });

  it("returns disconnected when no user key exists", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue(undefined);

    const res = await GET(new NextRequest("http://localhost/api/suno/status"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ connected: false });
  });

  it("returns connected with remaining credits", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("user-key");
    vi.mocked(getRemainingCredits).mockResolvedValue(123);

    const res = await GET(new NextRequest("http://localhost/api/suno/status"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.credits.remaining).toBe(123);
    expect(typeof data.validatedAt).toBe("string");
  });

  it("returns disconnected for invalid key errors", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("bad-key");
    vi.mocked(getRemainingCredits).mockRejectedValue(new SunoApiError(401, "Unauthorized"));

    const res = await GET(new NextRequest("http://localhost/api/suno/status"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ connected: false, error: "Invalid API key" });
  });

  it("returns 500 for unexpected upstream failures", async () => {
    vi.mocked(resolveUserApiKey).mockResolvedValue("user-key");
    vi.mocked(getRemainingCredits).mockRejectedValue(new Error("network"));

    const res = await GET(new NextRequest("http://localhost/api/suno/status"), seg);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({
      error: "Failed to check Suno connection",
      code: "INTERNAL_ERROR",
    });
  });
});
