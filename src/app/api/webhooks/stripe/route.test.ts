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
  STRIPE_PRICES: {
    get starter() { return "price_starter"; },
    get pro() { return "price_pro"; },
    get studio() { return "price_studio"; },
  },
  STRIPE_TOPUP_PRICES: {
    get credits_10() { return "price_topup_10"; },
    get credits_25() { return "price_topup_25"; },
    get credits_50() { return "price_topup_50"; },
  },
  TOPUP_PACKAGES: [
    { id: "credits_10", credits: 10, label: "10 Credits", priceLabel: "$0.99" },
    { id: "credits_25", credits: 25, label: "25 Credits", priceLabel: "$1.99" },
    { id: "credits_50", credits: 50, label: "50 Credits", priceLabel: "$3.49" },
  ],
}));

const mockHandleBillingEvent = vi.fn();
vi.mock("@/lib/billing", () => ({
  handleBillingEvent: (...args: unknown[]) => mockHandleBillingEvent(...args),
}));

const mockPaymentEventFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentEvent: {
      findUnique: (...args: unknown[]) => mockPaymentEventFindUnique(...args),
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

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPaymentEventFindUnique.mockResolvedValue(null);
  mockHandleBillingEvent.mockResolvedValue(undefined);
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
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", {}, "evt_dup"));
    mockPaymentEventFindUnique.mockResolvedValue({ id: "pe_existing" });

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);
    expect(mockHandleBillingEvent).not.toHaveBeenCalled();
  });

  it("checks idempotency by stripeEventId", async () => {
    const eventId = "evt_idempotency_check";
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", {}, eventId));

    await POST(makeRequest("{}", "valid-sig") as never);

    expect(mockPaymentEventFindUnique).toHaveBeenCalledWith({
      where: { stripeEventId: eventId },
      select: { id: true },
    });
  });

  // ── Delegation to handleBillingEvent ────────────────────────────────────────

  it("delegates to handleBillingEvent for new events", async () => {
    const event = makeStripeEvent("customer.subscription.updated", { id: "sub_123" });
    mockConstructEvent.mockReturnValue(event);

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    expect(mockHandleBillingEvent).toHaveBeenCalledWith(event);
  });

  it("returns 200 with received=true on successful processing", async () => {
    mockConstructEvent.mockReturnValue(makeStripeEvent("invoice.paid", {}));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it("returns 500 when handleBillingEvent throws", async () => {
    mockConstructEvent.mockReturnValue(
      makeStripeEvent("customer.subscription.created", { id: "sub_123" })
    );
    mockHandleBillingEvent.mockRejectedValue(new Error("DB connection lost"));

    const res = await POST(makeRequest("{}", "valid-sig") as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Internal error");
  });
});
