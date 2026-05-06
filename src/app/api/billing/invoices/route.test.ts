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

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

const mockInvoicesList = vi.fn();
vi.mock("@/lib/stripe", () => ({
  default: vi.fn(() => ({
    invoices: { list: mockInvoicesList },
  })),
}));

import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/billing/invoices");
}

const STRIPE_INVOICE = {
  id: "in_test_001",
  created: 1700000000,
  amount_paid: 999,
  total: 999,
  currency: "usd",
  status: "paid",
  invoice_pdf: "https://stripe.com/invoice.pdf",
  hosted_invoice_url: "https://invoice.stripe.com/inv_001",
  lines: { data: [{ description: "Pro plan" }] },
};

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
  mockInvoicesList.mockResolvedValue({ data: [STRIPE_INVOICE] });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/billing/invoices", () => {
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

  describe("free users", () => {
    it("returns empty invoices array when no subscription exists", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null as never);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoices).toEqual([]);
    });

    it("returns empty invoices array for free plan customers", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
        stripeCustomerId: "free_user-1",
      } as never);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoices).toEqual([]);
    });
  });

  describe("paid users", () => {
    it("returns mapped invoice list", async () => {
      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoices).toHaveLength(1);

      const inv = data.invoices[0];
      expect(inv.id).toBe("in_test_001");
      expect(inv.amount).toBe(999);
      expect(inv.currency).toBe("usd");
      expect(inv.status).toBe("paid");
      expect(inv.invoicePdf).toBe("https://stripe.com/invoice.pdf");
      expect(inv.hostedInvoiceUrl).toBe("https://invoice.stripe.com/inv_001");
      expect(inv.description).toBe("Pro plan");
    });

    it("uses amount_paid field for invoice amount", async () => {
      mockInvoicesList.mockResolvedValue({
        data: [{ ...STRIPE_INVOICE, amount_paid: 1999, total: 2499 }],
      });

      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.invoices[0].amount).toBe(1999);
    });

    it("returns empty invoices when Stripe returns no data", async () => {
      mockInvoicesList.mockResolvedValue({ data: [] });

      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.invoices).toEqual([]);
    });

    it("lists invoices for the correct Stripe customer", async () => {
      await GET(makeRequest() as never);

      expect(mockInvoicesList).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "cus_test_123" })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when Stripe throws", async () => {
      mockInvoicesList.mockRejectedValue(new Error("Stripe error"));

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
