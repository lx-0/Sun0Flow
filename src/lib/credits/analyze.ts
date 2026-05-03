import { LOW_CREDIT_THRESHOLD } from "./constants";
import type { RawMonthlyUsage } from "./usage";

export interface MonthlyCreditUsage {
  budget: number;
  subscriptionBudget: number;
  topUpCredits: number;
  topUpCreditsRemaining: number;
  subscriptionCreditsRemaining: number;
  creditsUsedThisMonth: number;
  creditsRemaining: number;
  generationsThisMonth: number;
  usagePercent: number;
  isLow: boolean;
  totalCreditsAllTime: number;
  totalGenerationsAllTime: number;
  dailyChart: Array<{ date: string; credits: number; count: number }>;
}

function buildDailyChart(
  dailyBreakdown: Array<{ date: string; credits: bigint; count: bigint }>,
  now: Date
): Array<{ date: string; credits: number; count: number }> {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const chart: Array<{ date: string; credits: number; count: number }> = [];

  for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const match = dailyBreakdown.find(
      (r) => new Date(r.date).toISOString().slice(0, 10) === dateStr
    );
    chart.push({
      date: dateStr,
      credits: match ? Number(match.credits) : 0,
      count: match ? Number(match.count) : 0,
    });
  }

  return chart;
}

export function analyzeUsage(
  subscriptionBudget: number,
  topUpCredits: number,
  raw: RawMonthlyUsage,
  now: Date
): MonthlyCreditUsage {
  const budget = subscriptionBudget + topUpCredits;
  const creditsUsedThisMonth = raw.monthlyCredits;
  const creditsRemaining = Math.max(0, budget - creditsUsedThisMonth);
  const usagePercent = budget > 0 ? creditsUsedThisMonth / budget : 0;
  const isLow = usagePercent >= 1 - LOW_CREDIT_THRESHOLD;

  const subscriptionCreditsRemaining = Math.max(0, subscriptionBudget - creditsUsedThisMonth);
  const topUpCreditsConsumed = Math.max(0, creditsUsedThisMonth - subscriptionBudget);
  const topUpCreditsRemaining = Math.max(0, topUpCredits - topUpCreditsConsumed);

  return {
    budget,
    subscriptionBudget,
    topUpCredits,
    topUpCreditsRemaining,
    subscriptionCreditsRemaining,
    creditsUsedThisMonth,
    creditsRemaining,
    generationsThisMonth: raw.monthlyCount,
    usagePercent: Math.round(usagePercent * 100),
    isLow,
    totalCreditsAllTime: raw.allTimeCredits,
    totalGenerationsAllTime: raw.allTimeCount,
    dailyChart: buildDailyChart(raw.dailyBreakdown, now),
  };
}
