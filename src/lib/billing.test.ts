import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSubscriptionFindUnique = vi.fn();
const mockSubscriptionCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
      create: (...args: unknown[]) => mockSubscriptionCreate(...args),
    },
  },
}));

// Lazy mock for stripe — only invoked in getOrCreateStripeCustomer
const mockStripeCustomersCreate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({ customers: { create: mockStripeCustomersCreate } })),
  STRIPE_PRICES: {
    get starter() { return process.env.STRIPE_PRICE_STARTER ?? ""; },
    get pro() { return process.env.STRIPE_PRICE_PRO ?? ""; },
    get studio() { return process.env.STRIPE_PRICE_STUDIO ?? ""; },
  },
}));

import {
  TIER_LIMITS,
  tierFromPriceId,
  ensureFreeSubscription,
  getOrCreateStripeCustomer,
} from "./billing";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
  process.env.STRIPE_PRICE_STUDIO = "price_studio_test";
});

// ─── TIER_LIMITS ──────────────────────────────────────────────────────────────

describe("TIER_LIMITS", () => {
  it("free tier has 200 credits and 5 generations/hr", () => {
    expect(TIER_LIMITS.free.creditsPerMonth).toBe(200);
    expect(TIER_LIMITS.free.generationsPerHour).toBe(5);
  });

  it("starter tier has 1500 credits and 25 generations/hr", () => {
    expect(TIER_LIMITS.starter.creditsPerMonth).toBe(1500);
    expect(TIER_LIMITS.starter.generationsPerHour).toBe(25);
  });

  it("pro tier has 5000 credits and 50 generations/hr", () => {
    expect(TIER_LIMITS.pro.creditsPerMonth).toBe(5000);
    expect(TIER_LIMITS.pro.generationsPerHour).toBe(50);
  });

  it("studio tier has 15000 credits and 100 generations/hr", () => {
    expect(TIER_LIMITS.studio.creditsPerMonth).toBe(15000);
    expect(TIER_LIMITS.studio.generationsPerHour).toBe(100);
  });
});

// ─── tierFromPriceId ──────────────────────────────────────────────────────────

describe("tierFromPriceId", () => {
  it("returns 'starter' for STRIPE_PRICE_STARTER", () => {
    expect(tierFromPriceId("price_starter_test")).toBe("starter");
  });

  it("returns 'pro' for STRIPE_PRICE_PRO", () => {
    expect(tierFromPriceId("price_pro_test")).toBe("pro");
  });

  it("returns 'studio' for STRIPE_PRICE_STUDIO", () => {
    expect(tierFromPriceId("price_studio_test")).toBe("studio");
  });

  it("returns 'free' for unrecognised price IDs", () => {
    expect(tierFromPriceId("price_unknown")).toBe("free");
  });

  it("returns 'free' for empty string", () => {
    expect(tierFromPriceId("")).toBe("free");
  });
});

// ─── ensureFreeSubscription ───────────────────────────────────────────────────

describe("ensureFreeSubscription", () => {
  it("creates a FREE subscription when none exists", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockSubscriptionCreate.mockResolvedValue({ id: "sub_new" });

    await ensureFreeSubscription("user-1");

    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          tier: "free",
          status: "active",
          stripePriceId: "free",
        }),
      })
    );
  });

  it("is idempotent — does not create a second record if one already exists", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      id: "sub_existing",
      tier: "free",
    });

    await ensureFreeSubscription("user-1");

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("does not overwrite existing paid subscription", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      id: "sub_pro",
      tier: "pro",
      status: "active",
    });

    await ensureFreeSubscription("user-1");

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("sets currentPeriodEnd approximately 1 month after currentPeriodStart", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockSubscriptionCreate.mockResolvedValue({ id: "sub_new" });

    const before = new Date();
    await ensureFreeSubscription("user-1");
    const after = new Date();

    const call = mockSubscriptionCreate.mock.calls[0][0];
    const start: Date = call.data.currentPeriodStart;
    const end: Date = call.data.currentPeriodEnd;

    expect(start >= before && start <= after).toBe(true);
    // End should be ~1 month ahead (within a day tolerance)
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(32);
  });
});

// ─── getOrCreateStripeCustomer ────────────────────────────────────────────────

describe("getOrCreateStripeCustomer", () => {
  it("returns existing Stripe customer ID without creating a new one", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      stripeCustomerId: "cus_existing_123",
    });

    const customerId = await getOrCreateStripeCustomer(
      "user-1",
      "user@example.com"
    );

    expect(customerId).toBe("cus_existing_123");
    expect(mockStripeCustomersCreate).not.toHaveBeenCalled();
  });

  it("creates a new Stripe customer when none exists (free_ prefix)", async () => {
    mockSubscriptionFindUnique.mockResolvedValue({
      stripeCustomerId: "free_user-1",
    });
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_new_456" });

    const customerId = await getOrCreateStripeCustomer(
      "user-1",
      "user@example.com",
      "Test User"
    );

    expect(customerId).toBe("cus_new_456");
    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        name: "Test User",
        metadata: { userId: "user-1" },
      })
    );
  });

  it("creates a new Stripe customer when subscription record does not exist", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_brand_new" });

    const customerId = await getOrCreateStripeCustomer(
      "user-2",
      "new@example.com"
    );

    expect(customerId).toBe("cus_brand_new");
    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        metadata: { userId: "user-2" },
      })
    );
  });

  it("passes undefined for name when not provided", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_noname" });

    await getOrCreateStripeCustomer("user-3", "anon@example.com");

    expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: undefined })
    );
  });
});
