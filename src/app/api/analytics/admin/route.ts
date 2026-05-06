import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get("range") || "30d";

  const now = new Date();
  let sinceDate: Date;
  switch (range) {
    case "7d":
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      sinceDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      sinceDate = new Date(0);
      break;
    default: // 30d
      sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

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

    // Daily active users in range
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("lastLoginAt") as date, COUNT(DISTINCT id)::bigint as count
      FROM "User"
      WHERE "lastLoginAt" >= ${sinceDate}
        AND "lastLoginAt" IS NOT NULL
      GROUP BY DATE("lastLoginAt")
      ORDER BY date ASC
    `,

    // Daily generation volume in range
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM "Song"
      WHERE "createdAt" >= ${sinceDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,

    // All songs with tags in range for genre popularity
    prisma.song.findMany({
      where: { createdAt: { gte: sinceDate }, tags: { not: null } },
      select: { tags: true },
    }),

    // Top creators in range
    prisma.$queryRaw<Array<{ userId: string; name: string | null; email: string | null; count: bigint }>>`
      SELECT s."userId", u."name", u."email", COUNT(*)::bigint as count
      FROM "Song" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."createdAt" >= ${sinceDate}
      GROUP BY s."userId", u."name", u."email"
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  // Genre breakdown
  const genreCounts: Record<string, number> = {};
  for (const song of allSongsForGenres) {
    if (!song.tags) continue;
    for (const raw of song.tags.split(",")) {
      const genre = raw.trim().toLowerCase();
      if (genre) {
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      }
    }
  }
  const popularGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));

  // Format chart data
  const generationsChart = dailyGenerations.map((row) => ({
    date: new Date(row.date).toISOString().split("T")[0],
    count: Number(row.count),
  }));

  const dauChart = dailyActiveUsers.map((row) => ({
    date: new Date(row.date).toISOString().split("T")[0],
    count: Number(row.count),
  }));

  return NextResponse.json({
    totalUsers,
    totalGenerations,
    generationsInRange,
    generationsToday,
    activeUsersWeek,
    range,
    dailyGenerations: generationsChart,
    dailyActiveUsers: dauChart,
    popularGenres,
    topCreators: topCreators.map((c) => ({
      userId: c.userId,
      name: c.name,
      email: c.email,
      count: Number(c.count),
    })),
  });
}
