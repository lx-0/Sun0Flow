import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({
  get DATABASE_URL() { return "postgres://test:test@localhost:5432/test"; },
  get AUTH_SECRET() { return "test-secret"; },
  get NEXTAUTH_URL() { return "http://localhost:3000"; },
  get SUNOAPI_KEY() { return "test-key"; },
  get SUNO_API_TIMEOUT_MS() { return 30000; },
  get RATE_LIMIT_MAX_GENERATIONS() { return 10; },
  env: {},
}));

vi.mock("@/lib/billing", () => ({
  TIER_LIMITS: {
    free: { creditsPerMonth: 200, generationsPerHour: 5 },
    starter: { creditsPerMonth: 1500, generationsPerHour: 25 },
    pro: { creditsPerMonth: 5000, generationsPerHour: 50 },
    studio: { creditsPerMonth: 15000, generationsPerHour: 100 },
  },
}));

const mockCreditUsageCreate = vi.fn();
const mockCreditUsageAggregate = vi.fn();
const mockNotificationFindFirst = vi.fn();
const mockNotificationCreate = vi.fn();
const mockQueryRaw = vi.fn();
const mockUserFindUnique = vi.fn();
const mockSubscriptionFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    creditUsage: {
      create: (...args: unknown[]) => mockCreditUsageCreate(...args),
      aggregate: (...args: unknown[]) => mockCreditUsageAggregate(...args),
    },
    notification: {
      findFirst: (...args: unknown[]) => mockNotificationFindFirst(...args),
      create: (...args: unknown[]) => mockNotificationCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    subscription: {
      findUnique: (...args: unknown[]) => mockSubscriptionFindUnique(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import {
  CREDIT_COSTS,
  DEFAULT_MONTHLY_BUDGET,
  LOW_CREDIT_THRESHOLD,
  recordCreditUsage,
  getMonthlyCreditUsage,
  shouldNotifyLowCredits,
  createLowCreditNotification,
} from "./credits";

// Use fake timers within the grace period so getMonthlyBudget returns 500 for
// users created before the cutoff date.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-26T12:00:00Z")); // within 30-day grace window
  // Default: user created before billing cutoff → grace budget = 500
  mockUserFindUnique.mockResolvedValue({ createdAt: new Date("2026-01-01") });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("constants", () => {
  it("CREDIT_COSTS has expected values", () => {
    expect(CREDIT_COSTS.generate).toBe(10);
    expect(CREDIT_COSTS.extend).toBe(10);
    expect(CREDIT_COSTS.lyrics).toBe(2);
    expect(CREDIT_COSTS.style_boost).toBe(5);
  });

  it("DEFAULT_MONTHLY_BUDGET is 500", () => {
    expect(DEFAULT_MONTHLY_BUDGET).toBe(500);
  });

  it("LOW_CREDIT_THRESHOLD is 0.2", () => {
    expect(LOW_CREDIT_THRESHOLD).toBe(0.2);
  });
});

describe("recordCreditUsage", () => {
  it("creates a credit usage record with default cost", async () => {
    mockCreditUsageCreate.mockResolvedValue({ id: "cu-1" });

    await recordCreditUsage("user-1", "generate");

    expect(mockCreditUsageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        action: "generate",
        creditCost: 10, // CREDIT_COSTS.generate
      }),
    });
  });

  it("uses provided creditCost over default", async () => {
    mockCreditUsageCreate.mockResolvedValue({ id: "cu-2" });

    await recordCreditUsage("user-1", "custom", { creditCost: 5, songId: "song-1" });

    expect(mockCreditUsageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creditCost: 5,
        songId: "song-1",
      }),
    });
  });

  it("uses 0 for unknown action when no cost provided", async () => {
    mockCreditUsageCreate.mockResolvedValue({ id: "cu-3" });

    await recordCreditUsage("user-1", "unknown_action");

    expect(mockCreditUsageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ creditCost: 0 }),
    });
  });

  it("includes description when provided", async () => {
    mockCreditUsageCreate.mockResolvedValue({ id: "cu-4" });

    await recordCreditUsage("user-1", "generate", { description: "Song: My Track" });

    expect(mockCreditUsageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: "Song: My Track" }),
    });
  });
});

describe("getMonthlyCreditUsage", () => {
  it("returns usage summary with correct calculations (grace period budget = 500)", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 100 }, _count: 10 }) // monthly
      .mockResolvedValueOnce({ _sum: { creditCost: 200 }, _count: 20 }); // all time
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.creditsUsedThisMonth).toBe(100);
    expect(usage.creditsRemaining).toBe(400); // 500 - 100 (grace period budget)
    expect(usage.generationsThisMonth).toBe(10);
    expect(usage.totalCreditsAllTime).toBe(200);
    expect(usage.totalGenerationsAllTime).toBe(20);
    expect(usage.budget).toBe(500);
    expect(usage.isLow).toBe(false); // 100/500 = 20%, threshold triggers at 80%
  });

  it("marks isLow=true when usage exceeds threshold", async () => {
    // LOW_CREDIT_THRESHOLD = 0.2 means warn when < 20% remaining (> 80% used)
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 }) // 90% used
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 });
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.isLow).toBe(true);
    expect(usage.creditsRemaining).toBe(50);
  });

  it("creditsRemaining is 0 when budget exhausted", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 600 }, _count: 60 })
      .mockResolvedValueOnce({ _sum: { creditCost: 600 }, _count: 60 });
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.creditsRemaining).toBe(0); // clamped to 0
  });

  it("handles null _sum.creditCost", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: null }, _count: 0 })
      .mockResolvedValueOnce({ _sum: { creditCost: null }, _count: 0 });
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.creditsUsedThisMonth).toBe(0);
    expect(usage.creditsRemaining).toBe(500);
  });

  it("uses subscription tier budget after grace period ends", async () => {
    // Simulate time after the 30-day grace period
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    mockSubscriptionFindUnique.mockResolvedValue({ tier: "starter", status: "active" });
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 100 }, _count: 10 })
      .mockResolvedValueOnce({ _sum: { creditCost: 100 }, _count: 10 });
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.budget).toBe(1500); // starter tier
    expect(usage.creditsRemaining).toBe(1400);
  });

  it("uses free tier budget for users without a subscription after grace period", async () => {
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));

    mockSubscriptionFindUnique.mockResolvedValue(null);
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 50 }, _count: 5 })
      .mockResolvedValueOnce({ _sum: { creditCost: 50 }, _count: 5 });
    mockQueryRaw.mockResolvedValue([]);

    const usage = await getMonthlyCreditUsage("user-1");

    expect(usage.budget).toBe(200); // free tier
  });
});

describe("shouldNotifyLowCredits", () => {
  it("returns false when credits are not low", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 50 }, _count: 5 }) // only 10% used
      .mockResolvedValueOnce({ _sum: { creditCost: 50 }, _count: 5 });
    mockQueryRaw.mockResolvedValue([]);

    const result = await shouldNotifyLowCredits("user-1");
    expect(result).toBe(false);
  });

  it("returns false when credits are low but already notified this month", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 })
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 });
    mockQueryRaw.mockResolvedValue([]);
    mockNotificationFindFirst.mockResolvedValue({ id: "notif-1" }); // already notified

    const result = await shouldNotifyLowCredits("user-1");
    expect(result).toBe(false);
  });

  it("returns true when low and not yet notified", async () => {
    mockCreditUsageAggregate
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 })
      .mockResolvedValueOnce({ _sum: { creditCost: 450 }, _count: 45 });
    mockQueryRaw.mockResolvedValue([]);
    mockNotificationFindFirst.mockResolvedValue(null); // no prior notification

    const result = await shouldNotifyLowCredits("user-1");
    expect(result).toBe(true);
  });
});

describe("createLowCreditNotification", () => {
  it("creates a notification with correct message", async () => {
    mockNotificationCreate.mockResolvedValue({ id: "notif-new" });

    await createLowCreditNotification("user-1", 50);

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "low_credits",
        title: "Low Credits Warning",
        href: "/analytics",
      }),
    });

    const call = mockNotificationCreate.mock.calls[0][0];
    expect(call.data.message).toContain("50");
    expect(call.data.message).toContain("500");
  });

  it("creates a notification with custom budget", async () => {
    mockNotificationCreate.mockResolvedValue({ id: "notif-new" });

    await createLowCreditNotification("user-1", 100, 1500);

    const call = mockNotificationCreate.mock.calls[0][0];
    expect(call.data.message).toContain("100");
    expect(call.data.message).toContain("1500");
  });
});
