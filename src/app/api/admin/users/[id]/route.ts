import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TIER_LIMITS } from "@/lib/billing";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const user = await prisma.user.findUnique({
    where: { id },
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

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const tier = user.subscription?.tier ?? "free";
  const creditsUsed = user.creditUsages.reduce((sum, c) => sum + c.creditCost, 0);
  const creditBudget = TIER_LIMITS[tier]?.creditsPerMonth ?? TIER_LIMITS.free.creditsPerMonth;
  const creditBalance = Math.max(0, creditBudget - creditsUsed);

  return NextResponse.json({
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
    creditBalance,
    creditBudget,
  });
}
