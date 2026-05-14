import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasProcessedStripeEvent, verifyStripeWebhookRequest } from "./webhook";

const mockConstructEvent = vi.fn();
const mockStripeWebhookSecret = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  })),
  STRIPE_WEBHOOK_SECRET: () => mockStripeWebhookSecret(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentEvent: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("billing webhook utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeWebhookSecret.mockReturnValue("whsec_test");
    mockFindUnique.mockResolvedValue(null);
  });

  it("returns 500 when webhook secret is missing", async () => {
    mockStripeWebhookSecret.mockReturnValue("");
    const request = new Request("http://localhost/api/webhook", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json", "stripe-signature": "sig" },
    });

    const result = await verifyStripeWebhookRequest(request as never, { routeTag: "test-route" });
    expect(result.event).toBeNull();
    expect(result.error?.status).toBe(500);
  });

  it("returns 400 when stripe signature is missing", async () => {
    const request = new Request("http://localhost/api/webhook", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    const result = await verifyStripeWebhookRequest(request as never, { routeTag: "test-route" });
    expect(result.event).toBeNull();
    expect(result.error?.status).toBe(400);
  });

  it("returns verified event when signature is valid", async () => {
    const event = { id: "evt_123", type: "invoice.paid" };
    mockConstructEvent.mockReturnValue(event);
    const request = new Request("http://localhost/api/webhook", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json", "stripe-signature": "sig" },
    });

    const result = await verifyStripeWebhookRequest(request as never, { routeTag: "test-route" });
    expect(result.error).toBeNull();
    expect(result.event).toEqual(event);
  });

  it("checks processed state by payment event id", async () => {
    mockFindUnique.mockResolvedValueOnce({ id: "pe_123" });
    await expect(hasProcessedStripeEvent("evt_123")).resolves.toBe(true);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { stripeEventId: "evt_123" },
      select: { id: true },
    });
  });
});
