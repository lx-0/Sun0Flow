import { describe, it, expect } from "vitest";
import { analyzeUsage, buildDailyChart, getCreditCost } from ".";
import type { RawMonthlyUsage } from ".";

describe("getCreditCost", () => {
  it("returns the cost for known actions", () => {
    expect(getCreditCost("generate")).toBe(10);
    expect(getCreditCost("lyrics")).toBe(2);
    expect(getCreditCost("style_boost")).toBe(5);
  });

  it("falls back to generate cost for unknown actions", () => {
    expect(getCreditCost("unknown_action")).toBe(10);
  });
});

describe("buildDailyChart", () => {
  it("fills in zero-usage days", () => {
    const now = new Date("2026-03-05T12:00:00Z");
    const chart = buildDailyChart([], now);

    expect(chart).toHaveLength(5);
    expect(chart.every((d) => d.credits === 0 && d.count === 0)).toBe(true);
    expect(chart[0].date).toBe("2026-03-01");
    expect(chart[4].date).toBe("2026-03-05");
  });

  it("maps breakdown entries to correct dates", () => {
    const now = new Date("2026-03-03T12:00:00Z");
    const breakdown = [
      { date: "2026-03-02", credits: BigInt(20), count: BigInt(2) },
    ];
    const chart = buildDailyChart(breakdown, now);

    expect(chart).toHaveLength(3);
    expect(chart[0]).toEqual({ date: "2026-03-01", credits: 0, count: 0 });
    expect(chart[1]).toEqual({ date: "2026-03-02", credits: 20, count: 2 });
    expect(chart[2]).toEqual({ date: "2026-03-03", credits: 0, count: 0 });
  });
});

describe("analyzeUsage", () => {
  const baseRaw: RawMonthlyUsage = {
    monthlyCredits: 0,
    monthlyCount: 0,
    allTimeCredits: 0,
    allTimeCount: 0,
    dailyBreakdown: [],
  };
  const now = new Date("2026-03-15T12:00:00Z");

  it("computes budget as subscription + top-up", () => {
    const usage = analyzeUsage(500, 100, baseRaw, now);
    expect(usage.budget).toBe(600);
    expect(usage.subscriptionBudget).toBe(500);
    expect(usage.topUpCredits).toBe(100);
  });

  it("computes remaining credits correctly", () => {
    const raw = { ...baseRaw, monthlyCredits: 200, monthlyCount: 20 };
    const usage = analyzeUsage(500, 0, raw, now);

    expect(usage.creditsUsedThisMonth).toBe(200);
    expect(usage.creditsRemaining).toBe(300);
    expect(usage.generationsThisMonth).toBe(20);
  });

  it("clamps remaining to zero when over budget", () => {
    const raw = { ...baseRaw, monthlyCredits: 600 };
    const usage = analyzeUsage(500, 0, raw, now);

    expect(usage.creditsRemaining).toBe(0);
    expect(usage.usagePercent).toBe(120);
  });

  it("marks isLow when usage >= 80% of budget", () => {
    const raw80 = { ...baseRaw, monthlyCredits: 400 };
    expect(analyzeUsage(500, 0, raw80, now).isLow).toBe(true);

    const raw79 = { ...baseRaw, monthlyCredits: 395 };
    expect(analyzeUsage(500, 0, raw79, now).isLow).toBe(false);
  });

  it("splits remaining between subscription and top-up", () => {
    const raw = { ...baseRaw, monthlyCredits: 350 };
    const usage = analyzeUsage(500, 200, raw, now);

    expect(usage.subscriptionCreditsRemaining).toBe(150);
    expect(usage.topUpCreditsRemaining).toBe(200);
  });

  it("top-up consumed only after subscription exhausted", () => {
    const raw = { ...baseRaw, monthlyCredits: 600 };
    const usage = analyzeUsage(500, 200, raw, now);

    expect(usage.subscriptionCreditsRemaining).toBe(0);
    expect(usage.topUpCreditsRemaining).toBe(100);
  });

  it("includes all-time stats", () => {
    const raw = { ...baseRaw, allTimeCredits: 5000, allTimeCount: 500 };
    const usage = analyzeUsage(500, 0, raw, now);

    expect(usage.totalCreditsAllTime).toBe(5000);
    expect(usage.totalGenerationsAllTime).toBe(500);
  });

  it("handles zero budget without division error", () => {
    const usage = analyzeUsage(0, 0, baseRaw, now);

    expect(usage.budget).toBe(0);
    expect(usage.usagePercent).toBe(0);
    expect(usage.isLow).toBe(false);
  });
});
