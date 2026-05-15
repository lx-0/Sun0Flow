import { prisma } from "@/lib/prisma";
import { parseDateRange, startOfToday, dateRangeStart } from "@/lib/date-series";
import { countGenres } from "@/lib/tags";

export interface AdminAnalytics {
  totalUsers: number;
  totalGenerations: number;
  generationsInRange: number;
  generationsToday: number;
  activeUsersWeek: number;
  range: string;
  dailyGenerations: Array<{ date: string; count: number }>;
  dailyActiveUsers: Array<{ date: string; count: number }>;
  popularGenres: Array<{ genre: string; count: number }>;
  topCreators: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    count: number;
  }>;
}

export async function getAdminAnalytics(range: string): Promise<AdminAnalytics> {
  const sinceDate = parseDateRange(range);
  const todayStart = startOfToday();
  const sevenDaysAgo = dateRangeStart(7);

  const [
    totalUsers,
    totalGenerations,
    generationsInRange,
    generationsToday,
    activeUsersWeek,
    dailyActiveUsers,
    dailyGenerations,
    allSongsForGenres,
    topCreators,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.song.count(),
    prisma.song.count({ where: { createdAt: { gte: sinceDate } } }),
    prisma.song.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("lastLoginAt") as date, COUNT(DISTINCT id)::bigint as count
      FROM "User"
      WHERE "lastLoginAt" >= ${sinceDate}
        AND "lastLoginAt" IS NOT NULL
      GROUP BY DATE("lastLoginAt")
      ORDER BY date ASC
    `,

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM "Song"
      WHERE "createdAt" >= ${sinceDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,

    prisma.song.findMany({
      where: { createdAt: { gte: sinceDate }, tags: { not: null } },
      select: { tags: true },
    }),

    prisma.$queryRaw<
      Array<{ userId: string; name: string | null; email: string | null; count: bigint }>
    >`
      SELECT s."userId", u."name", u."email", COUNT(*)::bigint as count
      FROM "Song" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."createdAt" >= ${sinceDate}
      GROUP BY s."userId", u."name", u."email"
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  return {
    totalUsers,
    totalGenerations,
    generationsInRange,
    generationsToday,
    activeUsersWeek,
    range,
    dailyGenerations: dailyGenerations.map((row) => ({
      date: new Date(row.date).toISOString().split("T")[0],
      count: Number(row.count),
    })),
    dailyActiveUsers: dailyActiveUsers.map((row) => ({
      date: new Date(row.date).toISOString().split("T")[0],
      count: Number(row.count),
    })),
    popularGenres: countGenres(allSongsForGenres, 10),
    topCreators: topCreators.map((c) => ({
      userId: c.userId,
      name: c.name,
      email: c.email,
      count: Number(c.count),
    })),
  };
}
