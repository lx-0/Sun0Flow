import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

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

vi.mock("@/lib/billing", () => ({
  TIER_LIMITS: {
    free: { creditsPerMonth: 200, generationsPerHour: 5 },
    starter: { creditsPerMonth: 1500, generationsPerHour: 25 },
    pro: { creditsPerMonth: 5000, generationsPerHour: 50 },
    studio: { creditsPerMonth: 15000, generationsPerHour: 100 },
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/billing/subscription");
}

const now = new Date("2026-01-01T00:00:00Z");
const periodEnd = new Date("2026-02-01T00:00:00Z");

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
    tier: "pro",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    trialEnd: null,
  } as never);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/billing/subscription", () => {
  describe("authentication", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(resolveUser).mockResolvedValue({
        userId: null,
        isApiKey: false,
        isAdmin: false,
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
      });

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(401);
    });
  });

  describe("no subscription record", () => {
    it("returns free tier defaults when no subscription exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tier).toBe("free");
      expect(data.status).toBe("active");
      expect(data.creditsPerMonth).toBe(200);
      expect(data.generationsPerHour).toBe(5);
      expect(data.cancelAtPeriodEnd).toBe(false);
    });
  });

  describe("active subscription", () => {
    it("returns pro tier info with correct limits", async () => {
      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.tier).toBe("pro");
      expect(data.status).toBe("active");
      expect(data.creditsPerMonth).toBe(5000);
      expect(data.generationsPerHour).toBe(50);
      expect(data.cancelAtPeriodEnd).toBe(false);
    });

    it("includes period dates in the response", async () => {
      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.currentPeriodStart).toBe(now.toISOString());
      expect(data.currentPeriodEnd).toBe(periodEnd.toISOString());
    });

    it("includes trialEnd as null when not on trial", async () => {
      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.trialEnd).toBeNull();
    });

    it("reflects cancelAtPeriodEnd when subscription is scheduled for cancellation", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        tier: "starter",
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
        trialEnd: null,
      } as never);

      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe("error handling", () => {
    it("returns 500 when prisma throws", async () => {
      vi.mocked(prisma.subscription.findUnique).mockRejectedValue(new Error("DB error"));

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
