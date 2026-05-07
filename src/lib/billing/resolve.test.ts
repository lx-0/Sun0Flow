import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

const mockSubscriptionFindFirst = vi.fn();
const mockPaymentEventCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
    },
    paymentEvent: {
      create: (...args: unknown[]) => mockPaymentEventCreate(...args),
    },
  },
}));

import {
  stripeStatusToPrisma,
  resolveSubscriptionDetails,
  resolveInvoiceContext,
  recordPaymentEvent,
  userIdFromCustomerId,
  userIdFromSubscriptionId,
} from "./resolve";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_STARTER = "price_starter_test";
  process.env.STRIPE_PRICE_PRO = "price_pro_test";
  process.env.STRIPE_PRICE_STUDIO = "price_studio_test";
});

// ─── stripeStatusToPrisma ────────────────────────────────────────────────────

describe("stripeStatusToPrisma", () => {
  it.each([
    ["active", "active"],
    ["trialing", "trialing"],
    ["past_due", "past_due"],
    ["canceled", "canceled"],
    ["unpaid", "unpaid"],
    ["incomplete", "incomplete"],
    ["incomplete_expired", "incomplete_expired"],
    ["paused", "paused"],
  ] as const)("maps %s → %s", (stripe, expected) => {
    expect(stripeStatusToPrisma(stripe)).toBe(expected);
  });
});

// ─── resolveSubscriptionDetails ──────────────────────────────────────────────

describe("resolveSubscriptionDetails", () => {
  it("extracts tier, priceId, and period from subscription item", () => {
    const stripeSub = {
      items: {
        data: [{
          price: { id: "price_pro_test" },
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        }],
      },
    } as unknown as Stripe.Subscription;

    const result = resolveSubscriptionDetails(stripeSub);

    expect(result.tier).toBe("pro");
    expect(result.priceId).toBe("price_pro_test");
    expect(result.periodStart).toEqual(new Date(1700000000 * 1000));
    expect(result.periodEnd).toEqual(new Date(1702592000 * 1000));
  });

  it("defaults to free tier and current dates when item has no price or period", () => {
    const before = new Date();
    const stripeSub = {
      items: { data: [{ price: null }] },
    } as unknown as Stripe.Subscription;

    const result = resolveSubscriptionDetails(stripeSub);

    expect(result.tier).toBe("free");
    expect(result.priceId).toBe("");
    expect(result.periodStart.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.periodEnd.getTime()).toBeGreaterThan(result.periodStart.getTime());
  });

  it("handles empty items array", () => {
    const stripeSub = {
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    const result = resolveSubscriptionDetails(stripeSub);

    expect(result.tier).toBe("free");
    expect(result.priceId).toBe("");
  });
});

// ─── resolveInvoiceContext ───────────────────────────────────────────────────

describe("resolveInvoiceContext", () => {
  it("extracts customerId, userId, and subscriptionId from invoice event", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user-1" });

    const event = {
      data: {
        object: {
          customer: "cus_123",
          parent: {
            type: "subscription_details",
            subscription_details: { subscription: "sub_456" },
          },
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveInvoiceContext(event);

    expect(result.customerId).toBe("cus_123");
    expect(result.userId).toBe("user-1");
    expect(result.subscriptionId).toBe("sub_456");
  });

  it("handles customer as object with id", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user-2" });

    const event = {
      data: {
        object: {
          customer: { id: "cus_obj_789" },
          parent: null,
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveInvoiceContext(event);

    expect(result.customerId).toBe("cus_obj_789");
    expect(result.userId).toBe("user-2");
    expect(result.subscriptionId).toBeUndefined();
  });

  it("returns null userId when customer not found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const event = {
      data: {
        object: {
          customer: "cus_unknown",
          parent: null,
        },
      },
    } as unknown as Stripe.Event;

    const result = await resolveInvoiceContext(event);

    expect(result.userId).toBeNull();
    expect(result.subscriptionId).toBeUndefined();
  });
});

// ─── recordPaymentEvent ──────────────────────────────────────────────────────

describe("recordPaymentEvent", () => {
  it("creates a payment event with the correct fields", async () => {
    mockPaymentEventCreate.mockResolvedValue({ id: "pe_1" });

    const event = { id: "evt_123", type: "invoice.payment_succeeded" } as unknown as Stripe.Event;

    await recordPaymentEvent(event, {
      userId: "user-1",
      amount: 2000,
      currency: "usd",
      status: "succeeded",
      customerId: "cus_123",
      subscriptionId: "sub_456",
      invoiceId: "inv_789",
    });

    expect(mockPaymentEventCreate).toHaveBeenCalledWith({
      data: {
        stripeEventId: "evt_123",
        type: "invoice.payment_succeeded",
        userId: "user-1",
        amount: 2000,
        currency: "usd",
        status: "succeeded",
        stripeCustomerId: "cus_123",
        metadata: { invoiceId: "inv_789", subscriptionId: "sub_456" },
      },
    });
  });

  it("handles null userId and undefined customerId", async () => {
    mockPaymentEventCreate.mockResolvedValue({ id: "pe_2" });

    const event = { id: "evt_456", type: "invoice.payment_failed" } as unknown as Stripe.Event;

    await recordPaymentEvent(event, {
      userId: null,
      amount: 1000,
      currency: "eur",
      status: "failed",
      customerId: undefined,
      subscriptionId: undefined,
      invoiceId: "inv_000",
    });

    expect(mockPaymentEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        stripeCustomerId: null,
        metadata: { invoiceId: "inv_000", subscriptionId: null },
      }),
    });
  });
});

// ─── userIdFromCustomerId ────────────────────────────────────────────────────

describe("userIdFromCustomerId", () => {
  it("returns userId when subscription found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user-1" });

    expect(await userIdFromCustomerId("cus_123")).toBe("user-1");
  });

  it("returns null when no subscription found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);

    expect(await userIdFromCustomerId("cus_unknown")).toBeNull();
  });
});

// ─── userIdFromSubscriptionId ────────────────────────────────────────────────

describe("userIdFromSubscriptionId", () => {
  it("returns userId when subscription found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user-2" });

    expect(await userIdFromSubscriptionId("sub_456")).toBe("user-2");
  });

  it("returns null when no subscription found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);

    expect(await userIdFromSubscriptionId("sub_unknown")).toBeNull();
  });
});
