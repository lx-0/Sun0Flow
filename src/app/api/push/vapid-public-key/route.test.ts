import { describe, it, expect, vi } from "vitest";
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

vi.mock("@/lib/auth", () => ({
  resolveUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockGetVapidPublicKey = vi.fn();
vi.mock("@/lib/push", () => ({
  getVapidPublicKey: () => mockGetVapidPublicKey(),
}));

import { GET } from "./route";

const seg = { params: Promise.resolve({}) };

describe("GET /api/push/vapid-public-key", () => {
  it("returns configured key", async () => {
    mockGetVapidPublicKey.mockReturnValue("public-key");

    const res = await GET(new NextRequest("http://localhost/api/push/vapid-public-key"), seg);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "public-key" });
  });

  it("returns null when key is not configured", async () => {
    mockGetVapidPublicKey.mockReturnValue(null);

    const res = await GET(new NextRequest("http://localhost/api/push/vapid-public-key"), seg);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: null });
  });
});
