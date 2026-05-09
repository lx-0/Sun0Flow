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

const mockCancelSubscription = vi.fn();
vi.mock("@/lib/billing", () => ({
  cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const seg = { params: Promise.resolve({}) } as never;

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/billing/cancel", {
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
  mockCancelSubscription.mockResolvedValue({ ok: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/billing/cancel", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(401);
    });
  });

  describe("subscription state checks", () => {
    it("returns 400 when no subscription record exists", async () => {
      mockCancelSubscription.mockResolvedValue({
        ok: false,
        code: "NO_SUBSCRIPTION",
        message: "No active paid subscription to cancel",
        status: 400,
      });

      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when subscription is a free plan (free_ prefix)", async () => {
      mockCancelSubscription.mockResolvedValue({
        ok: false,
        code: "NO_SUBSCRIPTION",
        message: "No active paid subscription to cancel",
        status: 400,
      });

      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when subscription is already scheduled for cancellation", async () => {
      mockCancelSubscription.mockResolvedValue({
        ok: false,
        code: "ALREADY_CANCELLED",
        message: "Subscription is already scheduled for cancellation",
        status: 400,
      });

      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("ALREADY_CANCELLED");
    });
  });

  describe("success", () => {
    it("cancels subscription at period end and returns success", async () => {
      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.cancelAtPeriodEnd).toBe(true);
    });

    it("passes userId and reason to cancelSubscription", async () => {
      await POST(makeRequest({ reason: "too expensive" }) as never, seg);
      expect(mockCancelSubscription).toHaveBeenCalledWith("user-1", "too expensive");
    });

    it("truncates reason to 500 characters", async () => {
      const longReason = "x".repeat(600);
      await POST(makeRequest({ reason: longReason }) as never, seg);
      expect(mockCancelSubscription).toHaveBeenCalledWith("user-1", "x".repeat(500));
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockCancelSubscription.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest() as never, seg);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
