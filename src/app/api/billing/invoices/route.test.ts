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

const mockGetInvoices = vi.fn();
vi.mock("@/lib/billing", () => ({
  getInvoices: (...args: unknown[]) => mockGetInvoices(...args),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request("http://localhost/api/billing/invoices");
}

const MAPPED_INVOICE = {
  id: "in_test_001",
  date: new Date(1700000000 * 1000).toISOString(),
  amount: 999,
  currency: "usd",
  status: "paid",
  invoicePdf: "https://stripe.com/invoice.pdf",
  hostedInvoiceUrl: "https://invoice.stripe.com/inv_001",
  description: "Pro plan",
};

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveUser).mockResolvedValue({
    userId: "user-1",
    isApiKey: false,
    isAdmin: false,
    error: null,
  });
  mockGetInvoices.mockResolvedValue([MAPPED_INVOICE]);
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
      mockGetInvoices.mockResolvedValue([]);

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.invoices).toEqual([]);
    });

    it("returns empty invoices array for free plan customers", async () => {
      mockGetInvoices.mockResolvedValue([]);

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

    it("returns empty invoices when module returns empty array", async () => {
      mockGetInvoices.mockResolvedValue([]);

      const res = await GET(makeRequest() as never);
      const data = await res.json();
      expect(data.invoices).toEqual([]);
    });

    it("passes userId to getInvoices", async () => {
      await GET(makeRequest() as never);
      expect(mockGetInvoices).toHaveBeenCalledWith("user-1");
    });
  });

  describe("error handling", () => {
    it("returns 500 when module throws", async () => {
      mockGetInvoices.mockRejectedValue(new Error("Stripe error"));

      const res = await GET(makeRequest() as never);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe("INTERNAL_ERROR");
    });
  });
});
