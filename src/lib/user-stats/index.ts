import { prisma } from "@/lib/prisma";

export type PeakHour = { hour: number; count: number };
export type GenreCount = { genre: string; count: number };
export type DailyCredit = { date: string; credits: number; count: number };

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

export function calculateListeningTime(
  playHistory: Array<{ playedAt: Date; song: { duration: number | null } }>,
  now: Date
): { totalListeningTimeSec: number; dailyListeningTime: Array<{ date: string; seconds: number; minutes: number }> } {
  let totalListeningTimeSec = 0;
  const dailyMap: Record<string, number> = {};

  for (const entry of playHistory) {
    const dur = entry.song.duration ?? 0;
    totalListeningTimeSec += dur;
    const dateStr = entry.playedAt.toISOString().slice(0, 10);
    dailyMap[dateStr] = (dailyMap[dateStr] ?? 0) + dur;
  }

  const dailyListeningTime: Array<{ date: string; seconds: number; minutes: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const sec = dailyMap[dateStr] ?? 0;
    dailyListeningTime.push({ date: dateStr, seconds: sec, minutes: Math.round(sec / 60) });
  }

  return { totalListeningTimeSec: Math.round(totalListeningTimeSec), dailyListeningTime };
}

export function buildPeakHoursHeatmap(rawHourCounts: Array<{ hour: number; count: bigint }>): PeakHour[] {
  return Array.from({ length: 24 }, (_, h) => {
    const match = rawHourCounts.find((r) => Number(r.hour) === h);
    return { hour: h, count: match ? Number(match.count) : 0 };
  });
}

export function calculateActivityStreaks(
  activeDayRows: Array<{ day: string }>,
  now: Date
): { currentStreak: number; longestStreak: number } {
  const activeDays = activeDayRows.map((r) =>
    new Date(r.day).toISOString().slice(0, 10)
  );
  const activeDaysSet = new Set(activeDays);

  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  let currentStreak = 0;
  if (activeDaysSet.has(todayStr) || activeDaysSet.has(yesterdayStr)) {
    const startDay = activeDaysSet.has(todayStr) ? todayStr : yesterdayStr;
    let checkDate = new Date(startDay);
    while (true) {
      const checkStr = checkDate.toISOString().slice(0, 10);
      if (!activeDaysSet.has(checkStr)) break;
      currentStreak++;
      checkDate = new Date(checkDate.getTime() - 86400000);
    }
  }

  let longestStreak = 0;
  let runningStreak = 0;
  for (let i = 0; i < 90; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    if (activeDaysSet.has(dStr)) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  return { currentStreak, longestStreak };
}

export function breakdownGenres(
  songsWithTags: Array<{ tags: string | null }>
): GenreCount[] {
  const genreCounts: Record<string, number> = {};

  for (const song of songsWithTags) {
    if (!song.tags) continue;
    for (const raw of song.tags.split(",")) {
      const genre = raw.trim().toLowerCase();
      if (genre) genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
    }
  }

  return Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }));
}

export function buildCreditChart(
  creditStats: Array<{ date: string; credits: bigint; count: bigint }>,
  now: Date
): DailyCredit[] {
  const creditMap: Record<string, { credits: number; count: number }> = {};
  for (const row of creditStats) {
    const dateStr = new Date(row.date).toISOString().slice(0, 10);
    creditMap[dateStr] = { credits: Number(row.credits), count: Number(row.count) };
  }

  const creditUsageByDay: DailyCredit[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = creditMap[dateStr] ?? { credits: 0, count: 0 };
    creditUsageByDay.push({ date: dateStr, ...entry });
  }

  return creditUsageByDay;
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
