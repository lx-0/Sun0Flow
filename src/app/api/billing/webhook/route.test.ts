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
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockStripeInstance = {
  webhooks: { constructEvent: mockConstructEvent },
  subscriptions: { retrieve: mockSubscriptionsRetrieve },
};
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => mockStripeInstance),
  STRIPE_WEBHOOK_SECRET: vi.fn(() => "whsec_test_secret"),
}));

const mockPaymentEventFindUnique = vi.fn();
const mockPaymentEventCreate = vi.fn();
const mockSubscriptionFindUnique = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockSubscriptionUpsert = vi.fn();
const mockSubscriptionUpdateMany = vi.fn();
const mockNotificationCreate = vi.fn();
const mockCreditTopUpFindUnique = vi.fn();
const mockCreditTopUpCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentEvent: {
      findUnique: (...args: unknown[]) => mockPaymentEventFindUnique(...args),
      create: (...args: unknown[]) => mockPaymentEventCreate(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
      upsert: (...args: unknown[]) => mockSubscriptionUpsert(...args),
      updateMany: (...args: unknown[]) => mockSubscriptionUpdateMany(...args),
    },
    notification: {
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    creditTopUp: {
      findUnique: (...args: unknown[]) => mockCreditTopUpFindUnique(...args),
      create: (...args: unknown[]) => mockCreditTopUpCreate(...args),
    },
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body = "{}", sig?: string): Request {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sig !== undefined ? { "stripe-signature": sig } : {}),
    },
    body,
  });
}

function makeStripeEvent(type: string, data: object, id = `evt_test_${Date.now()}`) {
  return { id, type, data: { object: data } };
}

const NOW_SEC = Math.floor(Date.now() / 1000);

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_starter" },
          current_period_start: NOW_SEC,
          current_period_end: NOW_SEC + 30 * 86400,
        },
      ],
    },
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    billing_cycle_anchor: NOW_SEC,
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_123",
    customer: "cus_123",
    amount_paid: 1500,
    amount_due: 1500,
    currency: "usd",
    parent: null,
    ...overrides,
  };
}

function makeCheckoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_123",
    mode: "subscription",
    customer: "cus_123",
    subscription: "sub_123",
    metadata: { userId: "user_abc" },
    amount_total: 999,
    currency: "usd",
    payment_intent: null,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default: event is new (not duplicate)
  mockPaymentEventFindUnique.mockResolvedValue(null);
  mockPaymentEventCreate.mockResolvedValue({ id: "pe_1" });

  // Default: subscription ops succeed
  mockSubscriptionUpsert.mockResolvedValue({});
  mockSubscriptionUpdateMany.mockResolvedValue({ count: 1 });

  // Default: known customer
  mockSubscriptionFindFirst.mockResolvedValue({ userId: "user_abc", tier: "starter" });
  mockSubscriptionFindUnique.mockResolvedValue({ userId: "user_abc" });

  // Default: notifications succeed
  mockNotificationCreate.mockResolvedValue({ id: "notif_1" });

  // Default: no existing top-up record
  mockCreditTopUpFindUnique.mockResolvedValue(null);
  mockCreditTopUpCreate.mockResolvedValue({ id: "topup_1" });

  // Default Stripe subscription retrieve (used by checkout.session.completed)
  mockSubscriptionsRetrieve.mockResolvedValue(makeSubscription());

  // Default env vars
  process.env.STRIPE_PRICE_STARTER = "price_starter";
  process.env.STRIPE_PRICE_PRO = "price_pro";
  process.env.STRIPE_PRICE_STUDIO = "price_studio";
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/billing/webhook", () => {
  // ── Missing webhook secret ──────────────────────────────────────────────────

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const { STRIPE_WEBHOOK_SECRET } = await import("@/lib/stripe");
    vi.mocked(STRIPE_WEBHOOK_SECRET).mockReturnValueOnce("");

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Webhook secret not configured");
  });

  // ── Signature validation ────────────────────────────────────────────────────

  it("returns 400 when stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}", undefined) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing stripe-signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(makeRequest("{}", "bad-sig") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid signature");
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it("returns 200 without re-processing when event already processed", async () => {
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", makeInvoice(), "evt_dup"));
    mockPaymentEventFindUnique.mockResolvedValue({ id: "pe_existing" });

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(mockPaymentEventCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("checks idempotency by stripeEventId", async () => {
    const eventId = "evt_idempotency_check";
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", makeInvoice(), eventId));
    mockPaymentEventFindUnique.mockResolvedValue(null);

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockPaymentEventFindUnique).toHaveBeenCalledWith({
      where: { stripeEventId: eventId },
    });
  });

  // ── checkout.session.completed (subscription) ───────────────────────────────

  it("upserts subscription on checkout.session.completed (subscription mode)", async () => {
    const session = makeCheckoutSession();
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));
    mockSubscriptionsRetrieve.mockResolvedValue(makeSubscription());

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_abc" },
        create: expect.objectContaining({
          userId: "user_abc",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
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

  it("skips checkout.session.completed when customerId is missing", async () => {
    const session = makeCheckoutSession({ customer: null });
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("skips checkout.session.completed when userId metadata is missing", async () => {
    const session = makeCheckoutSession({ metadata: {} });
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("handles topup checkout.session.completed (payment mode with topupCredits)", async () => {
    const session = makeCheckoutSession({
      mode: "payment",
      metadata: { userId: "user_abc", topupCredits: "25" },
      amount_total: 199,
    });
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockCreditTopUpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_abc",
          credits: 25,
          amountCents: 199,
        }),
      })
    );
    // Notification should be sent
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_abc",
          type: "credit_update",
        }),
      })
    );
    // Subscription upsert must NOT happen for top-up
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("skips duplicate topup checkout session (idempotent)", async () => {
    const session = makeCheckoutSession({
      mode: "payment",
      metadata: { userId: "user_abc", topupCredits: "10" },
    });
    mockConstructEvent.mockReturnValue(makeStripeEvent("checkout.session.completed", session));
    mockCreditTopUpFindUnique.mockResolvedValue({ id: "topup_existing" });

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockCreditTopUpCreate).not.toHaveBeenCalled();
  });

  // ── customer.subscription.updated ──────────────────────────────────────────

  it("reflects plan changes in DB on customer.subscription.updated", async () => {
    const sub = makeSubscription({ status: "active" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.updated", sub));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: "sub_123" },
        data: expect.objectContaining({
          tier: "starter",
          status: "active",
          stripePriceId: "price_starter",
        }),
      })
    );
  });

  it("updates status to past_due on customer.subscription.updated", async () => {
    const sub = makeSubscription({ status: "past_due" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.updated", sub));

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "past_due" }),
      })
    );
  });

  it("updates cancelAtPeriodEnd on customer.subscription.updated", async () => {
    const sub = makeSubscription({ cancel_at_period_end: true });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.updated", sub));

    await POST(makeRequest("{}", "valid-sig") as never);
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelAtPeriodEnd: true }),
      })
    );
  });

  // ── customer.subscription.deleted ──────────────────────────────────────────

  it("deactivates subscription and revokes credits on customer.subscription.deleted", async () => {
    const sub = makeSubscription({ status: "canceled" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.deleted", sub));
    // Return userId for this subscription
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user_abc", tier: "pro" });

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: "sub_123" },
        data: expect.objectContaining({
          tier: "free",
          status: "canceled",
          stripePriceId: "free",
        }),
      })
    );
  });

  it("skips subscription.deleted when no user found for subscription", async () => {
    const sub = makeSubscription({ id: "sub_unknown" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("customer.subscription.deleted", sub));
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpdateMany).not.toHaveBeenCalled();
  });

  // ── invoice.payment_succeeded ───────────────────────────────────────────────

  it("records payment event on invoice.payment_succeeded", async () => {
    const invoice = makeInvoice({ amount_paid: 1500, currency: "usd" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", invoice));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockPaymentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "invoice.payment_succeeded",
          amount: 1500,
          currency: "usd",
          userId: "user_abc",
          status: "succeeded",
        }),
      })
    );
  });

  it("sends credit refresh notification on invoice.payment_succeeded for paid tier", async () => {
    const invoice = makeInvoice({
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_123" },
      },
    });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", invoice));
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user_abc", tier: "pro" });

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_abc",
          type: "credit_update",
          title: "Credits refreshed",
        }),
      })
    );
  });

  it("does not send credit refresh notification for free tier on invoice.payment_succeeded", async () => {
    const invoice = makeInvoice({
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_free" },
      },
    });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", invoice));
    mockSubscriptionFindFirst.mockResolvedValue({ userId: "user_abc", tier: "free" });

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  it("does not send notification on invoice.payment_succeeded when no subscription found", async () => {
    const invoice = makeInvoice({
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_unknown" },
      },
    });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", invoice));
    mockSubscriptionFindFirst.mockResolvedValue(null);

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  // ── invoice.payment_failed ──────────────────────────────────────────────────

  it("records payment event on invoice.payment_failed", async () => {
    const invoice = makeInvoice({ amount_due: 1500, currency: "usd" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_failed", invoice));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockPaymentEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "invoice.payment_failed",
          amount: 1500,
          status: "failed",
        }),
      })
    );
  });

  it("sets subscription to past_due on invoice.payment_failed", async () => {
    const invoice = makeInvoice();
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_failed", invoice));

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockSubscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_abc" },
        data: { status: "past_due" },
      })
    );
  });

  it("sends payment failed notification to user on invoice.payment_failed", async () => {
    const invoice = makeInvoice();
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_failed", invoice));

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_abc",
          type: "payment_failed",
          title: "Payment Failed",
        }),
      })
    );
  });

  it("skips subscription update and notification when no user on invoice.payment_failed", async () => {
    const invoice = makeInvoice({ customer: "cus_unknown" });
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_failed", invoice));
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpdateMany).not.toHaveBeenCalled();
    expect(mockNotificationCreate).not.toHaveBeenCalled();
  });

  // ── Unhandled events ────────────────────────────────────────────────────────

  it("returns 200 for unhandled event types without processing", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.created", { id: "cus_new" })
    );

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdateMany).not.toHaveBeenCalled();
    expect(mockPaymentEventCreate).not.toHaveBeenCalled();
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns 500 when handler throws an unexpected error", async () => {
    const sub = makeSubscription();
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.updated", sub)
    );
    mockSubscriptionUpdateMany.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Webhook handler failed");
  });

  // ── Successful response ─────────────────────────────────────────────────────

  it("returns 200 with received=true on successful processing", async () => {
    const invoice = makeInvoice();
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.payment_succeeded", invoice));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});
