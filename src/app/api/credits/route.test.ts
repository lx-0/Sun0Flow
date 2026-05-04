import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/auth-resolver", () => ({
  resolveUser: vi.fn(),
}));

vi.mock("@/lib/credits", () => ({
  getMonthlyCreditUsage: vi.fn(),
}));

vi.mock("@/lib/error-logger", () => ({
  logServerError: vi.fn(),
}));

import { resolveUser } from "@/lib/auth-resolver";
import { getMonthlyCreditUsage } from "@/lib/credits";

const seg = { params: Promise.resolve({}) };

beforeEach(() => {
  vi.mocked(resolveUser).mockResolvedValue({ userId: "user-1", isApiKey: false, isAdmin: false, error: null });
});

describe("GET /api/credits", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(resolveUser).mockResolvedValue({
      userId: null,
      isApiKey: false,
      isAdmin: false,
      error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as never,
    });

    const res = await GET(new NextRequest("http://localhost/api/credits"), seg);
    expect(res.status).toBe(401);
  });

  it("returns credit usage for authenticated user", async () => {
    const usage = {
      budget: 500,
      subscriptionBudget: 500,
      topUpCredits: 0,
      topUpCreditsRemaining: 0,
      subscriptionCreditsRemaining: 400,
      creditsUsedThisMonth: 100,
      creditsRemaining: 400,
      generationsThisMonth: 10,
      usagePercent: 20,
      isLow: false,
      totalCreditsAllTime: 200,
      totalGenerationsAllTime: 20,
      dailyChart: [],
    };
    vi.mocked(getMonthlyCreditUsage).mockResolvedValue(usage);

    const res = await GET(new NextRequest("http://localhost/api/credits"), seg);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.creditsRemaining).toBe(400);
    expect(data.budget).toBe(500);
  });

  it("returns 500 when getMonthlyCreditUsage throws", async () => {
    vi.mocked(getMonthlyCreditUsage).mockRejectedValue(new Error("DB error"));

    const res = await GET(new NextRequest("http://localhost/api/credits"), seg);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe("INTERNAL_ERROR");
  });
});
