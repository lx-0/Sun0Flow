import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "./route";

// ─── Mocks ───────────────────────────────────────────────────────────────────

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

const mockCreateTopupSession = vi.fn();
const mockGetTopupHistory = vi.fn();
vi.mock("@/lib/billing", () => ({
  createTopupSession: (...args: unknown[]) => mockCreateTopupSession(...args),
  getTopupHistory: (...args: unknown[]) => mockGetTopupHistory(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const seg = { params: Promise.resolve({}) } as never;

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/billing/topup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(): Request {
  return new Request("http://localhost/api/billing/topup");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  mockCreateTopupSession.mockResolvedValue({
    ok: true,
    url: "https://checkout.stripe.com/topup_session",
  });
  mockGetTopupHistory.mockResolvedValue([]);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/billing/topup", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await POST(makePostRequest({ package: "credits_10" }) as never, seg);
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 400 when package is missing", async () => {
      mockCreateTopupSession.mockResolvedValue({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Invalid package. Must be one of: credits_10, credits_25, credits_50",
        status: 400,
      });

      const res = await POST(makePostRequest({}) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when package id is invalid", async () => {
      mockCreateTopupSession.mockResolvedValue({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Invalid package. Must be one of: credits_10, credits_25, credits_50",
        status: 400,
      });

      const res = await POST(makePostRequest({ package: "credits_100" }) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("user lookup", () => {
    it("returns 400 when user email is not found", async () => {
      mockCreateTopupSession.mockResolvedValue({
        ok: false,
        code: "USER_ERROR",
        message: "User email not found",
        status: 400,
      });

      const res = await POST(makePostRequest({ package: "credits_10" }) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("USER_ERROR");
    });
  });

  describe("success", () => {
    it("returns checkout URL on success", async () => {
      const res = await POST(makePostRequest({ package: "credits_10" }) as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe("https://checkout.stripe.com/topup_session");
    });

    it("passes userId and package to createTopupSession", async () => {
      await POST(makePostRequest({ package: "credits_25" }) as never, seg);
      expect(mockCreateTopupSession).toHaveBeenCalledWith("user-1", "credits_25");
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockCreateTopupSession.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makePostRequest({ package: "credits_25" }) as never, seg);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});

describe("GET /api/billing/topup", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await GET(makeGetRequest() as never, seg);
      expect(res.status).toBe(401);
    });
  });

  describe("success", () => {
    it("returns empty array when user has no top-ups", async () => {
      const res = await GET(makeGetRequest() as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.topUps).toEqual([]);
    });

    it("returns top-up history", async () => {
      const mockTopUps = [
        { id: "tu-1", credits: 10, amountCents: 99, currency: "usd", expiresAt: null, createdAt: new Date("2026-03-20") },
        { id: "tu-2", credits: 25, amountCents: 199, currency: "usd", expiresAt: null, createdAt: new Date("2026-03-15") },
      ];
      mockGetTopupHistory.mockResolvedValue(mockTopUps);

      const res = await GET(makeGetRequest() as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.topUps).toHaveLength(2);
      expect(data.topUps[0].id).toBe("tu-1");
      expect(data.topUps[0].credits).toBe(10);
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockGetTopupHistory.mockRejectedValue(new Error("DB error"));

      const res = await GET(makeGetRequest() as never, seg);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
