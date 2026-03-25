import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { TIER_LIMITS } from "@/lib/billing";

/** Estimated credit cost per action type */
export const CREDIT_COSTS: Record<string, number> = {
  generate: 10,
  extend: 10,
  cover: 10,
  mashup: 10,
  lyrics: 2,
  style_boost: 5,
};

/** Legacy default monthly credit budget — retained for grace period */
export const DEFAULT_MONTHLY_BUDGET = 500;

/** Threshold percentage at which to warn users (0.0 - 1.0) */
export const LOW_CREDIT_THRESHOLD = 0.2;

/**
 * Billing launch date. Users created before this date retain DEFAULT_MONTHLY_BUDGET
 * for GRACE_PERIOD_DAYS as a transition allowance.
 */
export const GRACE_PERIOD_CUTOFF = new Date("2026-03-25T00:00:00Z");
export const GRACE_PERIOD_DAYS = 30;

/**
 * Get the monthly credit budget for a user based on their subscription tier.
 * Users created before GRACE_PERIOD_CUTOFF retain DEFAULT_MONTHLY_BUDGET (500)
 * for 30 days after the cutoff date.
 */
export async function getMonthlyBudget(userId: string): Promise<number> {
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

/**
 * Record a credit usage event for a user.
 */
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

/**
 * Get the user's credit usage summary for the current month.
 */
export async function getMonthlyCreditUsage(userId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [budget, monthlyUsage, totalAllTime, dailyBreakdown] = await Promise.all([
    getMonthlyBudget(userId),
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

  const creditsUsedThisMonth = monthlyUsage._sum.creditCost ?? 0;
  const generationsThisMonth = monthlyUsage._count;
  const creditsRemaining = Math.max(0, budget - creditsUsedThisMonth);
  const usagePercent = budget > 0 ? creditsUsedThisMonth / budget : 0;
  const isLow = usagePercent >= (1 - LOW_CREDIT_THRESHOLD);

  // Fill daily chart for current month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyChart: Array<{ date: string; credits: number; count: number }> = [];
  for (let d = 1; d <= Math.min(now.getDate(), daysInMonth); d++) {
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const match = dailyBreakdown.find(
      (r) => new Date(r.date).toISOString().slice(0, 10) === dateStr
    );
    dailyChart.push({
      date: dateStr,
      credits: match ? Number(match.credits) : 0,
      count: match ? Number(match.count) : 0,
    });
  }

  return {
    budget,
    creditsUsedThisMonth,
    creditsRemaining,
    generationsThisMonth,
    usagePercent: Math.round(usagePercent * 100),
    isLow,
    totalCreditsAllTime: totalAllTime._sum.creditCost ?? 0,
    totalGenerationsAllTime: totalAllTime._count,
    dailyChart,
  };
}

/**
 * Check if the user should receive a low-credit notification.
 * Returns true if they crossed the threshold and haven't been notified yet this month.
 */
export async function shouldNotifyLowCredits(userId: string): Promise<boolean> {
  const usage = await getMonthlyCreditUsage(userId);
  if (!usage.isLow) return false;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Check if we already sent a low_credit notification this month
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "low_credits",
      createdAt: { gte: startOfMonth },
    },
  });

  return !existing;
}

/**
 * Create a low-credit warning notification for the user.
 */
export async function createLowCreditNotification(
  userId: string,
  creditsRemaining: number,
  budget: number = DEFAULT_MONTHLY_BUDGET
) {
  return prisma.notification.create({
    data: {
      userId,
      type: "low_credits",
      title: "Low Credits Warning",
      message: `You have approximately ${creditsRemaining} credits remaining this month (out of ${budget}). Consider reducing usage to avoid running out.`,
      href: "/analytics",
    },
  });
}
