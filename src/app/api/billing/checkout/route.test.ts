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

const mockCreateCheckoutSession = vi.fn();
vi.mock("@/lib/billing", () => ({
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { resolveUser } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const seg = { params: Promise.resolve({}) } as never;

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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
  mockCreateCheckoutSession.mockResolvedValue({
    ok: true,
    url: "https://checkout.stripe.com/session_abc",
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/billing/checkout", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await POST(makeRequest({ tier: "starter" }) as never, seg);
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 400 when tier is invalid", async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Invalid tier. Must be one of: starter, pro, studio",
        status: 400,
      });

      const res = await POST(makeRequest({ tier: "enterprise" }) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("user lookup", () => {
    it("returns 400 when user email is not found", async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        ok: false,
        code: "USER_ERROR",
        message: "User email not found",
        status: 400,
      });

      const res = await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("USER_ERROR");
    });
  });

  describe("success", () => {
    it("returns checkout URL on success", async () => {
      const res = await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe("https://checkout.stripe.com/session_abc");
    });

    it("passes tier and userId to createCheckoutSession", async () => {
      await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith("user-1", "pro");
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockCreateCheckoutSession.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest({ tier: "starter" }) as never, seg);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("upgrade/downgrade for existing paid subscribers", () => {
    it("returns success URL for inline plan change", async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        ok: true,
        url: "http://localhost:3000/settings/billing?success=1",
      });

      const res = await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("/settings/billing?success=1");
    });

    it("returns 400 when user is already on the requested plan", async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        ok: false,
        code: "SAME_PLAN",
        message: "Already subscribed to this plan",
        status: 400,
      });

      const res = await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("SAME_PLAN");
    });

    it("returns 500 when subscription item is missing during upgrade", async () => {
      mockCreateCheckoutSession.mockResolvedValue({
        ok: false,
        code: "SUBSCRIPTION_ERROR",
        message: "Could not find subscription item to update",
        status: 500,
      });

      const res = await POST(makeRequest({ tier: "pro" }) as never, seg);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("SUBSCRIPTION_ERROR");
    });
  });
});
