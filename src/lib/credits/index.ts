import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { TIER_LIMITS } from "@/lib/billing";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CREDIT_COSTS: Record<string, number> = {
  generate: 10,
  extend: 10,
  cover: 10,
  mashup: 10,
  lyrics: 2,
  style_boost: 5,
};

export const DEFAULT_MONTHLY_BUDGET = 500;

export const LOW_CREDIT_THRESHOLD = 0.2;

export const GRACE_PERIOD_CUTOFF = new Date("2026-03-25T00:00:00Z");
export const GRACE_PERIOD_DAYS = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export type CreditCheckResult =
  | { ok: true; creditCost: number; creditsRemaining: number }
  | { ok: false; creditCost: number; creditsRemaining: number };

// ---------------------------------------------------------------------------
// Credit usage recording
// ---------------------------------------------------------------------------

export async function recordCreditUsage(
  userId: string,
  action: string,
  opts?: { songId?: string; creditCost?: number; description?: string }
) {
  const cost = opts?.creditCost ?? CREDIT_COSTS[action] ?? 0;
  const record = await prisma.creditUsage.create({
    data: {
      userId,
      action,
      creditCost: cost,
      songId: opts?.songId,
      description: opts?.description,
    },
  });
  logger.info(
    { userId, action, creditCost: cost, songId: opts?.songId ?? null },
    "credits: usage recorded"
  );
  return record;
}

// ---------------------------------------------------------------------------
// Monthly credit usage status
// ---------------------------------------------------------------------------

interface RawMonthlyUsage {
  monthlyCredits: number;
  monthlyCount: number;
  allTimeCredits: number;
  allTimeCount: number;
  dailyBreakdown: Array<{ date: string; credits: bigint; count: bigint }>;
}

async function getTopUpCreditsRemaining(userId: string): Promise<number> {
  const now = new Date();
  const result = await prisma.creditTopUp.aggregate({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { credits: true },
  });
  return result._sum.credits ?? 0;
}

async function getSubscriptionBudget(userId: string): Promise<number> {
  const gracePeriodEnd = new Date(
    GRACE_PERIOD_CUTOFF.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  if (new Date() < gracePeriodEnd) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (user && user.createdAt < GRACE_PERIOD_CUTOFF) {
      return DEFAULT_MONTHLY_BUDGET;
    }
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { tier: true, status: true },
  });

  if (!sub || sub.status !== "active") {
    return TIER_LIMITS.free.creditsPerMonth;
  }

  return TIER_LIMITS[sub.tier].creditsPerMonth;
}

async function fetchMonthlyUsage(
  userId: string,
  startOfMonth: Date
): Promise<RawMonthlyUsage> {
  const [monthlyUsage, totalAllTime, dailyBreakdown] = await Promise.all([
    prisma.creditUsage.aggregate({
      where: { userId, createdAt: { gte: startOfMonth } },
      _sum: { creditCost: true },
      _count: true,
    }),
    prisma.creditUsage.aggregate({
      where: { userId },
      _sum: { creditCost: true },
      _count: true,
    }),
    prisma.$queryRaw<Array<{ date: string; credits: bigint; count: bigint }>>`
      SELECT DATE("createdAt") as date,
             SUM("creditCost")::bigint as credits,
             COUNT(*)::bigint as count
      FROM "CreditUsage"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${startOfMonth}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return {
    monthlyCredits: monthlyUsage._sum.creditCost ?? 0,
    monthlyCount: monthlyUsage._count,
    allTimeCredits: totalAllTime._sum.creditCost ?? 0,
    allTimeCount: totalAllTime._count,
    dailyBreakdown,
  };
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

function analyzeUsage(
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

export async function getMonthlyCreditUsage(userId: string): Promise<MonthlyCreditUsage> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [subscriptionBudget, topUpCredits, raw] = await Promise.all([
    getSubscriptionBudget(userId),
    getTopUpCreditsRemaining(userId),
    fetchMonthlyUsage(userId, startOfMonth),
  ]);

  return analyzeUsage(subscriptionBudget, topUpCredits, raw, now);
}

// ---------------------------------------------------------------------------
// Low-credit notifications
// ---------------------------------------------------------------------------

export async function shouldNotifyLowCredits(
  userId: string,
  usage: MonthlyCreditUsage
): Promise<boolean> {
  if (!usage.isLow) return false;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "low_credits",
      createdAt: { gte: startOfMonth },
    },
  });

  return !existing;
}

export async function createLowCreditNotification(
  userId: string,
  creditsRemaining: number,
  budget: number = DEFAULT_MONTHLY_BUDGET
) {
  return createNotification({
    userId,
    type: "low_credits",
    title: "Low Credits Warning",
    message: `You have approximately ${creditsRemaining} credits remaining this month (out of ${budget}). Consider reducing usage to avoid running out.`,
    href: "/analytics",
  });
}

// ---------------------------------------------------------------------------
// Credit spend (check + deduct)
// ---------------------------------------------------------------------------

export function getCreditCost(action: string): number {
  return CREDIT_COSTS[action] ?? CREDIT_COSTS.generate;
}

export async function checkCredits(
  userId: string,
  action: string
): Promise<CreditCheckResult> {
  const creditCost = getCreditCost(action);
  const usage = await getMonthlyCreditUsage(userId);
  return {
    ok: usage.creditsRemaining >= creditCost,
    creditCost,
    creditsRemaining: usage.creditsRemaining,
  };
}

export async function deductCredits(
  userId: string,
  action: string,
  opts?: { songId?: string; description?: string }
): Promise<void> {
  const creditCost = getCreditCost(action);
  await recordCreditUsage(userId, action, {
    creditCost,
    songId: opts?.songId,
    description: opts?.description,
  });

  try {
    const usage = await getMonthlyCreditUsage(userId);
    if (await shouldNotifyLowCredits(userId, usage)) {
      await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
    }
  } catch {
    // Non-critical — don't block the caller
  }
}
