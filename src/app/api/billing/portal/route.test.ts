import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

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

const mockCreatePortalSession = vi.fn();
vi.mock("@/lib/billing", () => ({
  createPortalSession: (...args: unknown[]) => mockCreatePortalSession(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
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
  mockCreatePortalSession.mockResolvedValue({
    ok: true,
    url: "https://billing.stripe.com/portal_abc",
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/billing/portal", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(401);
    });
  });

  describe("subscription checks", () => {
    it("returns 400 when no subscription record exists", async () => {
      mockCreatePortalSession.mockResolvedValue({
        ok: false,
        code: "NO_SUBSCRIPTION",
        message: "No active paid subscription found",
        status: 400,
      });

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when customer is on free plan (free_ prefix)", async () => {
      mockCreatePortalSession.mockResolvedValue({
        ok: false,
        code: "NO_SUBSCRIPTION",
        message: "No active paid subscription found",
        status: 400,
      });

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });
  });

  describe("success", () => {
    it("creates a portal session and returns url", async () => {
      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe("https://billing.stripe.com/portal_abc");
    });

    it("passes userId to createPortalSession", async () => {
      await POST(makeRequest() as never);
      expect(mockCreatePortalSession).toHaveBeenCalledWith("user-1");
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockCreatePortalSession.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
