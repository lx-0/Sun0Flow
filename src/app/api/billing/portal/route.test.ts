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
    subscription: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockPortalSessionCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    billingPortal: { sessions: { create: mockPortalSessionCreate } },
  })),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
    stripeCustomerId: "cus_test_123",
  } as never);
  mockPortalSessionCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal_abc" });
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
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("NO_SUBSCRIPTION");
    });

    it("returns 400 when customer is on free plan (free_ prefix)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        stripeCustomerId: "free_user-1",
      } as never);

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

    it("creates the portal session with the correct customer id", async () => {
      await POST(makeRequest() as never);

      expect(mockPortalSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_test_123" })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when Stripe throws", async () => {
      mockPortalSessionCreate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
