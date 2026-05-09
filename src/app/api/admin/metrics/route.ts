import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    newUsersToday,
    activeUsers7d,
    activeUsers30d,
    totalSongs,
    songsToday,
    subscriptionsByTier,
    creditUsageMonth,
    topSongs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    prisma.song.count(),
    prisma.song.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.subscription.groupBy({
      by: ["tier"],
      where: { status: { in: ["active", "trialing"] } },
      _count: { id: true },
    }),
    prisma.creditUsage.aggregate({
      where: { createdAt: { gte: monthStart }, creditCost: { gt: 0 } },
      _sum: { creditCost: true },
    }),
    prisma.song.findMany({
      where: { generationStatus: "ready" },
      orderBy: { playCount: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        playCount: true,
        imageUrl: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  // Daily new signups for last 30 days
  const dailySignups = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM "User"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  // Daily songs generated for last 30 days
  const dailyGenerations = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM "Song"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  const TIER_MONTHLY_PRICE_CENTS: Record<string, number> = {
    free: 0,
    starter: 999,
    pro: 2999,
    studio: 9999,
  };

  const mrrCents = subscriptionsByTier.reduce((sum, row) => {
    return sum + (TIER_MONTHLY_PRICE_CENTS[row.tier] ?? 0) * row._count.id;
  }, 0);

  const tierBreakdown = subscriptionsByTier.reduce<Record<string, number>>((acc, row) => {
    acc[row.tier] = row._count.id;
    return acc;
  }, {});

  return NextResponse.json({
    totalUsers,
    newUsersToday,
    activeUsers7d,
    activeUsers30d,
    totalSongs,
    songsToday,
    mrrCents,
    tierBreakdown,
    creditUsageMonth: creditUsageMonth._sum.creditCost ?? 0,
    topSongs: topSongs.map((s) => ({
      id: s.id,
      title: s.title,
      playCount: s.playCount,
      imageUrl: s.imageUrl,
      creator: s.user,
    })),
    dailySignups: dailySignups.map((r) => ({
      date: new Date(r.date).toISOString().split("T")[0],
      count: Number(r.count),
    })),
    dailyGenerations: dailyGenerations.map((r) => ({
      date: new Date(r.date).toISOString().split("T")[0],
      count: Number(r.count),
    })),
  });
}
