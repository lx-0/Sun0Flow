import { prisma } from "@/lib/prisma";
import { countActiveUsers } from "@/lib/active-users";

const TIER_MONTHLY_PRICE_CENTS: Record<string, number> = {
  starter: 999,
  pro: 2999,
  studio: 9999,
};

export interface AdminStats {
  totalUsers: number;
  payingUsers: number;
  mrrCents: number;
  totalGenerations: number;
  generationsToday: number;
  generationsWeek: number;
  generationsMonth: number;
  activeUsers7d: number;
  activeUsers30d: number;
  pendingReports: number;
  recentErrors: number;
  dailyGenerations: Array<{ date: string; count: number }>;
}

export async function getAdminStats(): Promise<AdminStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
    prisma.song.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.song.count({ where: { createdAt: { gte: monthStart } } }),
    countActiveUsers(sevenDaysAgo),
    countActiveUsers(thirtyDaysAgo),
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

  const mrrCents = subscriptionsByTier.reduce((sum, row) => {
    return sum + (TIER_MONTHLY_PRICE_CENTS[row.tier] ?? 0) * row._count.id;
  }, 0);

  const dailyRaw = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
    SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
    FROM "Song"
    WHERE "createdAt" >= ${thirtyDaysAgo}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  const dailyGenerations = dailyRaw.map((row) => ({
    date: new Date(row.date).toISOString().split("T")[0],
    count: Number(row.count),
  }));

  return {
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
    dailyGenerations,
  };
}
