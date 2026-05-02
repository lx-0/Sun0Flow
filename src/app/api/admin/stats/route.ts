import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = adminRoute(async () => {

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalGenerations,
    generationsToday,
    generationsWeek,
    generationsMonth,
    activeUsers7d,
    activeUsers30d,
    pendingReports,
    recentErrors,
    payingUsers,
    subscriptionsByTier,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.song.count(),
    prisma.song.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.song.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.song.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    prisma.report.count({ where: { status: "pending" } }),
    prisma.errorReport.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.subscription.count({
      where: { status: { in: ["active", "trialing"] }, tier: { not: "free" } },
    }),
    prisma.subscription.groupBy({
      by: ["tier"],
      where: { status: { in: ["active", "trialing"] }, tier: { not: "free" } },
      _count: { id: true },
    }),
  ]);

  // Approximate MRR from tier counts (cents)
  const TIER_MONTHLY_PRICE_CENTS: Record<string, number> = {
    starter: 999,
    pro: 2999,
    studio: 9999,
  };
  const mrrCents = subscriptionsByTier.reduce((sum, row) => {
    return sum + (TIER_MONTHLY_PRICE_CENTS[row.tier] ?? 0) * row._count.id;
  }, 0);

  // Daily generation volume for last 30 days
  const dailyGenerations = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM "Song"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  const chartData = dailyGenerations.map((row) => ({
    date: new Date(row.date).toISOString().split("T")[0],
    count: Number(row.count),
  }));

  return NextResponse.json({
    totalUsers,
    payingUsers,
    mrrCents,
    totalGenerations,
    generationsToday,
    generationsWeek,
    generationsMonth,
    activeUsers7d,
    activeUsers30d,
    pendingReports,
    recentErrors,
    dailyGenerations: chartData,
  });
});
