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
    user: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/billing", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockSessionCreate = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockSubscriptionsUpdate = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    checkout: { sessions: { create: mockSessionCreate } },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  })),
  STRIPE_PRICES: {
    get starter() { return "price_starter_test"; },
    get pro() { return "price_pro_test"; },
    get studio() { return "price_studio_test"; },
  },
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateStripeCustomer } from "@/lib/billing";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    email: "user@example.com",
    name: "Test User",
  } as never);
  // Default: no existing paid subscription (free user)
  vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);
  vi.mocked(getOrCreateStripeCustomer).mockResolvedValue("cus_test_123");
  mockSessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });
  mockSubscriptionsRetrieve.mockResolvedValue({
    items: { data: [{ id: "si_item_123", price: { id: "price_starter_test" } }] },
  });
  mockSubscriptionsUpdate.mockResolvedValue({});
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

      const res = await POST(makeRequest({ tier: "starter" }) as never);
      expect(res.status).toBe(401);
    });
  });

  describe("validation", () => {
    it("returns 400 when tier is missing", async () => {
      const res = await POST(makeRequest({}) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when tier is invalid", async () => {
      const res = await POST(makeRequest({ tier: "enterprise" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("user lookup", () => {
    it("returns 400 when user email is not found", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("USER_ERROR");
    });

    it("returns 400 when user has no email", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: null, name: null } as never);

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("USER_ERROR");
    });
  });

  describe("success", () => {
    it.each(["starter", "pro", "studio"] as const)(
      "creates a checkout session for tier '%s' and returns url",
      async (tier) => {
        const res = await POST(makeRequest({ tier }) as never);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.url).toBe("https://checkout.stripe.com/session_abc");
      }
    );

    it("creates checkout session with subscription mode and correct metadata", async () => {
      await POST(makeRequest({ tier: "pro" }) as never);

      expect(mockSessionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "subscription",
          customer: "cus_test_123",
          metadata: { userId: "user-1" },
        })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when Stripe throws", async () => {
      mockSessionCreate.mockRejectedValue(new Error("Stripe error"));

      const res = await POST(makeRequest({ tier: "starter" }) as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("upgrade/downgrade for existing paid subscribers", () => {
    const activePaidSub = {
      stripeSubscriptionId: "sub_existing_123",
      stripeCustomerId: "cus_existing_123",
      stripePriceId: "price_starter_test",
      status: "active",
    };

    it("updates subscription inline when user has active paid plan and tier differs", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(activePaidSub as never);

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("/settings/billing?success=1");

      // Should NOT create a new checkout session
      expect(mockSessionCreate).not.toHaveBeenCalled();

      // Should retrieve and update the existing subscription
      expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith("sub_existing_123");
      expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
        "sub_existing_123",
        expect.objectContaining({
          items: [{ id: "si_item_123", price: "price_pro_test" }],
          proration_behavior: "create_prorations",
        })
      );
    });

    it("returns 400 when user is already on the requested plan", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        ...activePaidSub,
        stripePriceId: "price_pro_test",
      } as never);

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("SAME_PLAN");
    });

    it("creates a new checkout session for trialing users upgrading", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        ...activePaidSub,
        status: "trialing",
        stripePriceId: "price_starter_test",
      } as never);

      const res = await POST(makeRequest({ tier: "studio" }) as never);
      expect(res.status).toBe(200);
      // Inline update path used (no new checkout session)
      expect(mockSessionCreate).not.toHaveBeenCalled();
      expect(mockSubscriptionsUpdate).toHaveBeenCalled();
    });

    it("creates a new checkout session when user is on free plan", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        stripeSubscriptionId: "free_sub_user-1",
        stripeCustomerId: "free_user-1",
        stripePriceId: "free",
        status: "active",
      } as never);

      const res = await POST(makeRequest({ tier: "starter" }) as never);
      expect(res.status).toBe(200);
      expect(mockSessionCreate).toHaveBeenCalled();
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("creates a new checkout session when no subscription record exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(200);
      expect(mockSessionCreate).toHaveBeenCalled();
      expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("returns 500 when subscription item is missing during upgrade", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(activePaidSub as never);
      mockSubscriptionsRetrieve.mockResolvedValue({ items: { data: [] } });

      const res = await POST(makeRequest({ tier: "pro" }) as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("SUBSCRIPTION_ERROR");
    });
  });
});
