import { prisma } from "@/lib/prisma";
import { calculateListeningTime } from "./listening-time";
import { buildPeakHoursHeatmap } from "./peak-hours";
import { calculateActivityStreaks } from "./streaks";
import { breakdownGenres } from "./genres";
import { buildCreditChart } from "./credits";
import type { PeakHour } from "./peak-hours";
import type { GenreCount } from "./genres";
import type { DailyCredit } from "./credits";

export interface UserStats {
  totalSongsGenerated: number;
  completedGenerations: number;
  successRate: number;
  totalListeningTimeSec: number;
  songsThisWeek: number;
  songsLastWeek: number;
  songsThisMonth: number;
  songsLastMonth: number;
  weekTrend: number;
  monthTrend: number;
  playCountThisWeek: number;
  mostPlayedSongs: Array<{
    id: string;
    title: string | null;
    tags: string | null;
    playCount: number;
    duration: number | null;
    imageUrl: string | null;
    createdAt: string;
  }>;
  favoriteGenres: GenreCount[];
  dailyListeningTime: Array<{ date: string; seconds: number; minutes: number }>;
  peakHours: PeakHour[];
  currentStreak: number;
  longestStreak: number;
  creditUsageByDay: DailyCredit[];
  totalCreditsUsed: number;
}

export async function getUserStats(userId: string): Promise<UserStats> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);
  const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [
    totalSongsGenerated,
    completedGenerations,
    songsThisWeek,
    songsLastWeek,
    songsThisMonth,
    songsLastMonth,
    mostPlayedSongs,
    allSongsWithTags,
    playHistoryForTime,
    playHistoryByHour,
    dailyActivity,
    creditStats,
    totalCreditsUsed,
  ] = await Promise.all([
    prisma.song.count({ where: { userId } }),
    prisma.song.count({ where: { userId, generationStatus: "ready" } }),
    prisma.song.count({ where: { userId, createdAt: { gte: startOfThisWeek } } }),
    prisma.song.count({
      where: { userId, createdAt: { gte: startOfLastWeek, lt: startOfThisWeek } },
    }),
    prisma.song.count({ where: { userId, createdAt: { gte: startOfThisMonth } } }),
    prisma.song.count({
      where: { userId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
    }),
    prisma.song.findMany({
      where: { userId, generationStatus: "ready", playCount: { gt: 0 } },
      orderBy: { playCount: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        tags: true,
        playCount: true,
        duration: true,
        imageUrl: true,
        createdAt: true,
      },
    }),
    prisma.song.findMany({
      where: { userId, tags: { not: null } },
      select: { tags: true },
    }),
    prisma.playHistory.findMany({
      where: { userId, playedAt: { gte: thirtyDaysAgo } },
      select: {
        playedAt: true,
        song: { select: { duration: true } },
      },
    }),
    prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "playedAt") AS hour, COUNT(*)::bigint AS count
      FROM "PlayHistory"
      WHERE "userId" = ${userId}
      GROUP BY EXTRACT(HOUR FROM "playedAt")
      ORDER BY hour ASC
    `,
    prisma.$queryRaw<Array<{ day: string }>>`
      SELECT DISTINCT DATE("playedAt") AS day
      FROM "PlayHistory"
      WHERE "userId" = ${userId}
        AND "playedAt" >= ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)}
      ORDER BY day DESC
    `,
    prisma.$queryRaw<Array<{ date: string; credits: bigint; count: bigint }>>`
      SELECT DATE("createdAt") AS date, SUM("creditCost")::bigint AS credits, COUNT(*)::bigint AS count
      FROM "CreditUsage"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
    prisma.creditUsage.aggregate({
      where: { userId },
      _sum: { creditCost: true },
    }),
  ]);

  const { totalListeningTimeSec, dailyListeningTime } = calculateListeningTime(playHistoryForTime, now);
  const peakHours = buildPeakHoursHeatmap(playHistoryByHour);
  const { currentStreak, longestStreak } = calculateActivityStreaks(dailyActivity, now);
  const favoriteGenres = breakdownGenres(allSongsWithTags);
  const creditUsageByDay = buildCreditChart(creditStats, now);

  const weekTrend = songsThisWeek - songsLastWeek;
  const monthTrend = songsThisMonth - songsLastMonth;
  const successRate =
    totalSongsGenerated > 0
      ? Math.round((completedGenerations / totalSongsGenerated) * 100)
      : 0;
  const playCountThisWeek = playHistoryForTime.filter(
    (e) => e.playedAt >= sevenDaysAgo
  ).length;

  return {
    totalSongsGenerated,
    completedGenerations,
    successRate,
    totalListeningTimeSec,
    songsThisWeek,
    songsLastWeek,
    songsThisMonth,
    songsLastMonth,
    weekTrend,
    monthTrend,
    playCountThisWeek,
    mostPlayedSongs: mostPlayedSongs.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    favoriteGenres,
    dailyListeningTime,
    peakHours,
    currentStreak,
    longestStreak,
    creditUsageByDay,
    totalCreditsUsed: totalCreditsUsed._sum.creditCost ?? 0,
  };
}
