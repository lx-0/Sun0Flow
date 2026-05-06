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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockSubscriptionsUpdate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    subscriptions: { update: mockSubscriptionsUpdate },
  })),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/billing/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ACTIVE_SUBSCRIPTION = {
  stripeCustomerId: "cus_test_123",
  stripeSubscriptionId: "sub_test_456",
  status: "active",
  cancelAtPeriodEnd: false,
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue(ACTIVE_SUBSCRIPTION as never);
  vi.mocked(prisma.subscription.update).mockResolvedValue({} as never);
  mockSubscriptionsUpdate.mockResolvedValue({});
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

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(401);
    });
  });

  describe("subscription state checks", () => {
    it("returns 400 when no subscription record exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when subscription is a free plan (free_ prefix)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        stripeCustomerId: "free_user-1",
        stripeSubscriptionId: "free_sub_user-1",
        status: "active",
        cancelAtPeriodEnd: false,
      } as never);

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when subscription is already scheduled for cancellation", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        ...ACTIVE_SUBSCRIPTION,
        cancelAtPeriodEnd: true,
      } as never);

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("ALREADY_CANCELLED");
    });
  });

  describe("success", () => {
    it("cancels subscription at period end and returns success", async () => {
      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.cancelAtPeriodEnd).toBe(true);
    });

    it("calls Stripe to set cancel_at_period_end", async () => {
      await POST(makeRequest() as never);

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        "sub_test_456",
        expect.objectContaining({ cancel_at_period_end: true })
      );
    });

    it("updates the subscription record in the database", async () => {
      await POST(makeRequest() as never);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { cancelAtPeriodEnd: true },
      });
    });

    it("passes cancellation reason to Stripe when provided", async () => {
      await POST(makeRequest({ reason: "too expensive" }) as never);

      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        "sub_test_456",
        expect.objectContaining({
          metadata: { cancellation_reason: "too expensive" },
        })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when Stripe throws", async () => {
      mockSubscriptionsUpdate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
