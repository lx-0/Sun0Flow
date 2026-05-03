import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/lib/billing";
import {
  DEFAULT_MONTHLY_BUDGET,
  GRACE_PERIOD_CUTOFF,
  GRACE_PERIOD_DAYS,
} from "./constants";

export async function getTopUpCreditsRemaining(userId: string): Promise<number> {
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

export async function getSubscriptionBudget(userId: string): Promise<number> {
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

export async function getMonthlyBudget(userId: string): Promise<number> {
  const [subscriptionBudget, topUpCredits] = await Promise.all([
    getSubscriptionBudget(userId),
    getTopUpCreditsRemaining(userId),
  ]);
  return subscriptionBudget + topUpCredits;
}
