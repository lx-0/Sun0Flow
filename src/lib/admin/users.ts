import { SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/auth";
import { TIER_LIMITS } from "@/lib/billing";
import { type Result, success, Err } from "@/lib/result";

const VALID_TIERS: SubscriptionTier[] = ["free", "starter", "pro", "studio"];

export interface AdminUserDetail {
  id: string;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  songCount: number;
  playlistCount: number;
  favoriteCount: number;
  planTier: string;
  subscriptionStatus: string | null;
  creditBalance: number;
  creditBudget: number;
}

export async function getAdminUserDetail(
  userId: string,
): Promise<Result<AdminUserDetail>> {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      isDisabled: true,
      onboardingCompleted: true,
      createdAt: true,
      lastLoginAt: true,
      _count: {
        select: { songs: true, playlists: true, favorites: true },
      },
      subscription: {
        select: { tier: true, status: true },
      },
      creditUsages: {
        where: { createdAt: { gte: monthStart } },
        select: { creditCost: true },
      },
    },
  });

  if (!user) return Err.notFound("User not found");

  const tier = user.subscription?.tier ?? "free";
  const creditsUsed = user.creditUsages.reduce(
    (sum, c) => sum + c.creditCost,
    0,
  );
  const creditBudget =
    TIER_LIMITS[tier]?.creditsPerMonth ?? TIER_LIMITS.free.creditsPerMonth;

  return success({
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    isDisabled: user.isDisabled,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    songCount: user._count.songs,
    playlistCount: user._count.playlists,
    favoriteCount: user._count.favorites,
    planTier: tier,
    subscriptionStatus: user.subscription?.status ?? null,
    creditBalance: Math.max(0, creditBudget - creditsUsed),
    creditBudget,
  });
}

export async function adjustUserCredits(
  userId: string,
  amount: number,
  reason: string,
  adminId: string,
): Promise<Result<{ ok: true; amount: number }>> {
  const truncated = Math.trunc(amount);
  if (truncated === 0) return Err.validation("amount must be a non-zero integer");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return Err.notFound("User not found");

  await prisma.creditUsage.create({
    data: {
      userId,
      action: "admin_adjustment",
      creditCost: -truncated,
      description: reason,
    },
  });

  await logAdminAction(
    adminId,
    "adjust_credits",
    userId,
    `${truncated > 0 ? "+" : ""}${truncated} credits for user ${user.email}: ${reason}`,
  );

  return success({ ok: true, amount: truncated });
}

export async function toggleUserEnabled(
  userId: string,
  adminId: string,
): Promise<Result<{ id: string; isDisabled: boolean }>> {
  if (userId === adminId) {
    return Err.validation("Cannot disable your own account");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isDisabled: true, email: true },
  });
  if (!target) return Err.notFound("User not found");

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isDisabled: !target.isDisabled },
    select: { id: true, isDisabled: true },
  });

  await logAdminAction(
    adminId,
    updated.isDisabled ? "disable_user" : "enable_user",
    userId,
    `User ${target.email} ${updated.isDisabled ? "disabled" : "enabled"}`,
  );

  return success(updated);
}

export async function changeUserPlan(
  userId: string,
  tier: string,
  adminId: string,
): Promise<Result<{ ok: true; tier: string }>> {
  if (!VALID_TIERS.includes(tier as SubscriptionTier)) {
    return Err.validation(`tier must be one of: ${VALID_TIERS.join(", ")}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      subscription: { select: { id: true, tier: true } },
    },
  });
  if (!user) return Err.notFound("User not found");

  const previousTier = user.subscription?.tier ?? "free";

  if (tier === "free") {
    if (user.subscription) {
      await prisma.subscription.update({
        where: { userId },
        data: { tier: "free", status: "canceled" },
      });
    }
  } else {
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeCustomerId: `admin_${userId}`,
        stripeSubscriptionId: `admin_sub_${userId}_${Date.now()}`,
        stripePriceId: `admin_${tier}`,
        tier: tier as SubscriptionTier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + thirtyDays),
      },
      update: {
        tier: tier as SubscriptionTier,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + thirtyDays),
      },
    });
  }

  await logAdminAction(
    adminId,
    "change_plan",
    userId,
    `User ${user.email} plan changed from ${previousTier} to ${tier}`,
  );

  return success({ ok: true, tier });
}
