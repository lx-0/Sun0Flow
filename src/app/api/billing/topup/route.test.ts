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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    creditTopUp: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/billing", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockSessionCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    checkout: { sessions: { create: mockSessionCreate } },
  })),
  STRIPE_TOPUP_PRICES: {
    get credits_10() { return "price_topup_10_test"; },
    get credits_25() { return "price_topup_25_test"; },
    get credits_50() { return "price_topup_50_test"; },
  },
  TOPUP_PACKAGES: [
    { id: "credits_10", credits: 10, label: "10 Credits", priceLabel: "$0.99" },
    { id: "credits_25", credits: 25, label: "25 Credits", priceLabel: "$1.99" },
    { id: "credits_50", credits: 50, label: "50 Credits", priceLabel: "$3.49" },
  ],
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateStripeCustomer } from "@/lib/billing";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    email: "user@example.com",
    name: "Test User",
  } as never);
  vi.mocked(getOrCreateStripeCustomer).mockResolvedValue("cus_test_123");
  mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/topup_session" });
  vi.mocked(prisma.creditTopUp.findMany).mockResolvedValue([]);
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

      const res = await POST(makePostRequest({ package: "credits_10" }) as never);
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 400 when package is missing", async () => {
      const res = await POST(makePostRequest({}) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when package id is invalid", async () => {
      const res = await POST(makePostRequest({ package: "credits_100" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("user lookup", () => {
    it("returns 400 when user email is not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const res = await POST(makePostRequest({ package: "credits_10" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("USER_ERROR");
    });
  });

  describe("success", () => {
    it.each(["credits_10", "credits_25", "credits_50"] as const)(
      "creates a checkout session for package '%s' and returns url",
      async (pkg) => {
        const res = await POST(makePostRequest({ package: pkg }) as never);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.url).toBe("https://checkout.stripe.com/topup_session");
      }
    );

    it("creates checkout session with payment mode and correct metadata", async () => {
      await POST(makePostRequest({ package: "credits_10" }) as never);

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          customer: "cus_test_123",
          metadata: expect.objectContaining({
            userId: "user-1",
            topupPackage: "credits_10",
            topupCredits: "10",
          }),
        })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when Stripe throws", async () => {
      mockSessionCreate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makePostRequest({ package: "credits_25" }) as never);
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

      const res = await GET(makeGetRequest() as never);
      expect(res.status).toBe(401);
    });
  });

  describe("success", () => {
    it("returns empty array when user has no top-ups", async () => {
      const res = await GET(makeGetRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.topUps).toEqual([]);
    });

    it("returns top-up history sorted by most recent", async () => {
      const mockTopUps = [
        { id: "tu-1", credits: 10, amountCents: 99, currency: "usd", expiresAt: null, createdAt: new Date("2026-03-20") },
        { id: "tu-2", credits: 25, amountCents: 199, currency: "usd", expiresAt: null, createdAt: new Date("2026-03-15") },
      ];
      vi.mocked(prisma.creditTopUp.findMany).mockResolvedValue(mockTopUps as never);

      const res = await GET(makeGetRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.topUps).toHaveLength(2);
      expect(data.topUps[0].id).toBe("tu-1");
      expect(data.topUps[0].credits).toBe(10);
    });
  });

  describe("error handling", () => {
    it("returns 500 when prisma throws", async () => {
      vi.mocked(prisma.creditTopUp.findMany).mockRejectedValue(new Error("DB error"));

      const res = await GET(makeGetRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
