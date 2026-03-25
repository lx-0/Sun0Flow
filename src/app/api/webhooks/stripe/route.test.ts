import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

const mockConstructEvent = vi.fn();
const mockStripeInstance = {
  webhooks: {
    constructEvent: mockConstructEvent,
  },
};
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => mockStripeInstance),
  STRIPE_WEBHOOK_SECRET: vi.fn(() => "whsec_test_secret"),
}));

const mockPaymentEventFindUnique = vi.fn();
const mockPaymentEventCreate = vi.fn();
const mockSubscriptionFindUnique = vi.fn();
const mockSubscriptionUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentEvent: {
      findUnique: (...args: unknown[]) => mockPaymentEventFindUnique(...args),
      create: (...args: unknown[]) => mockPaymentEventCreate(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
      upsert: (...args: unknown[]) => mockSubscriptionUpsert(...args),
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body = "{}", sig?: string): Request {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig !== undefined ? { "stripe-signature": sig } : {}),
    },
    body,
  });
}

function makeStripeEvent(
  type: string,
  data: object,
  id = `evt_test_${Date.now()}`
) {
  return { id, type, data: { object: data } };
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_starter" },
          current_period_start: now,
          current_period_end: now + 30 * 86400,
        },
      ],
    },
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    billing_cycle_anchor: now,
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_123",
    customer: "cus_123",
    amount_paid: 999,
    amount_due: 999,
    currency: "usd",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: event is not a duplicate
  mockPaymentEventFindUnique.mockResolvedValue(null);
  mockPaymentEventCreate.mockResolvedValue({ id: "pe_1" });
  mockSubscriptionUpsert.mockResolvedValue({});
  // Default: known customer
  mockSubscriptionFindUnique.mockResolvedValue({ userId: "user_abc" });
});

describe("POST /api/webhooks/stripe", () => {
  // ── Signature validation ────────────────────────────────────────────────────

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}", undefined) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing stripe-signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });

    const res = await POST(makeRequest("{}", "bad-sig") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Webhook signature verification failed");
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it("returns 200 with duplicate=true when event already processed", async () => {
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", makeInvoice(), "evt_dup"));
    mockPaymentEventFindUnique.mockResolvedValue({ id: "pe_existing" }); // already processed

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);
    // Must not write again
    expect(mockPaymentEventCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("checks idempotency by stripeEventId", async () => {
    const eventId = "evt_idempotency_check";
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", makeInvoice(), eventId));
    mockPaymentEventFindUnique.mockResolvedValue(null);
    mockPaymentEventCreate.mockResolvedValue({ id: "pe_new" });

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockPaymentEventFindUnique).toHaveBeenCalledWith({
      where: { stripeEventId: eventId },
      select: { id: true },
    });
  });

  // ── customer.subscription.created / updated ─────────────────────────────────

  it("upserts subscription on customer.subscription.created", async () => {
    const sub = makeSubscription();
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.created", sub)
    );
    process.env.STRIPE_PRICE_STARTER = "price_starter";

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: "sub_123" },
        create: expect.objectContaining({
          userId: "user_abc",
          tier: "starter",
          status: "active",
        }),
        update: expect.objectContaining({
          tier: "starter",
          status: "active",
        }),
      })
    );
  });

  it("upserts subscription on customer.subscription.updated", async () => {
    const sub = makeSubscription({ status: "past_due" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "past_due" }),
      })
    );
  });

  it("sets status to canceled on customer.subscription.deleted", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sub = makeSubscription({ status: "canceled", canceled_at: now });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.deleted", sub)
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "canceled" }),
      })
    );
  });

  it("skips subscription upsert when no matching user is found", async () => {
    mockSubscriptionFindUnique.mockResolvedValue(null); // no user for this customer
    const sub = makeSubscription({ customer: "cus_unknown" });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("handles nested customer object (not just string ID)", async () => {
    const sub = makeSubscription({
      customer: { id: "cus_nested", object: "customer" },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );
    // Return userId for the nested customer ID
    mockSubscriptionFindUnique.mockImplementation(({ where }: { where: { stripeCustomerId: string } }) => {
      if (where.stripeCustomerId === "cus_nested") return Promise.resolve({ userId: "user_nested" });
      return Promise.resolve(null);
    });

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: "user_nested" }),
      })
    );
  });

  // ── invoice.paid ────────────────────────────────────────────────────────────

  it("records payment event on invoice.paid", async () => {
    const invoice = makeInvoice({ amount_paid: 2499, currency: "usd" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", invoice));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockPaymentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "invoice.paid",
          amount: 2499,
          currency: "usd",
          userId: "user_abc",
          status: "processed",
        }),
      })
    );
    // Must NOT touch subscription for payment events
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  // ── invoice.payment_failed → PAST_DUE ──────────────────────────────────────

  it("records payment event on invoice.payment_failed", async () => {
    // amount_paid is 0 on failed payments; ?? passes 0 through (not null/undefined)
    const invoice = makeInvoice({ amount_paid: 0, amount_due: 999 });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.payment_failed", invoice)
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockPaymentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "invoice.payment_failed",
          amount: 0, // amount_paid=0 is passed through ?? (not null/undefined)
        }),
      })
    );
  });

  // ── Unknown events audited ──────────────────────────────────────────────────

  it("records unknown events for auditing without processing them", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.created", { id: "cus_new" })
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockPaymentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "customer.created" }),
      })
    );
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  // ── Tier mapping ────────────────────────────────────────────────────────────

  it("maps pro price ID to pro tier", async () => {
    process.env.STRIPE_PRICE_PRO = "price_pro";
    const sub = makeSubscription({
      items: {
        data: [
          {
            price: { id: "price_pro" },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        ],
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tier: "pro" }),
      })
    );
  });

  it("maps studio price ID to studio tier", async () => {
    process.env.STRIPE_PRICE_STUDIO = "price_studio";
    const sub = makeSubscription({
      items: {
        data: [
          {
            price: { id: "price_studio" },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        ],
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tier: "studio" }),
      })
    );
  });

  it("falls back to free tier for unrecognised price IDs", async () => {
    process.env.STRIPE_PRICE_STARTER = "price_starter_real";
    const sub = makeSubscription({
      items: {
        data: [
          {
            price: { id: "price_unknown" },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        ],
      },
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ tier: "free" }),
      })
    );
  });

  // ── cancelAtPeriodEnd ───────────────────────────────────────────────────────

  it("persists cancelAtPeriodEnd=true when user schedules cancellation", async () => {
    const sub = makeSubscription({ cancel_at_period_end: true });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ cancelAtPeriodEnd: true }),
      })
    );
  });

  // ── Trial dates ─────────────────────────────────────────────────────────────

  it("persists trial start/end dates when present", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sub = makeSubscription({
      status: "trialing",
      trial_start: now - 86400,
      trial_end: now + 86400 * 14,
    });
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.created", sub)
    );

    await POST(makeRequest("{}", "valid-sig") as never);
    const call = mockSubscriptionUpsert.mock.calls[0][0];
    expect(call.create.trialStart).toBeInstanceOf(Date);
    expect(call.create.trialEnd).toBeInstanceOf(Date);
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns 500 when event handler throws an unexpected error", async () => {
    const sub = makeSubscription();
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.created", sub)
    );
    mockSubscriptionUpsert.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Internal error");
  });

  // ── Successful response ─────────────────────────────────────────────────────

  it("returns 200 with received=true on successful processing", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("invoice.paid", makeInvoice())
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });
});
