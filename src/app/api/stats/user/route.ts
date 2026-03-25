import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { internalError } from "@/lib/api-error";
import { logServerError } from "@/lib/error-logger";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

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
      // Total songs generated
      prisma.song.count({ where: { userId } }),

      // Completed generations
      prisma.song.count({ where: { userId, generationStatus: "ready" } }),

      // Songs this week
      prisma.song.count({ where: { userId, createdAt: { gte: startOfThisWeek } } }),

      // Songs last week (for trend)
      prisma.song.count({
        where: { userId, createdAt: { gte: startOfLastWeek, lt: startOfThisWeek } },
      }),

      // Songs this month
      prisma.song.count({ where: { userId, createdAt: { gte: startOfThisMonth } } }),

      // Songs last month (for trend)
      prisma.song.count({
        where: { userId, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
      }),

      // Most played songs (top 10 by playCount)
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

      // All songs with tags for genre breakdown
      prisma.song.findMany({
        where: { userId, tags: { not: null } },
        select: { tags: true },
      }),

      // Play history with song duration for listening time (last 30 days)
      prisma.playHistory.findMany({
        where: { userId, playedAt: { gte: thirtyDaysAgo } },
        select: {
          playedAt: true,
          song: { select: { duration: true } },
        },
      }),

      // Play history grouped by hour for peak listening heatmap
      prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
        SELECT EXTRACT(HOUR FROM "playedAt") AS hour, COUNT(*)::bigint AS count
        FROM "PlayHistory"
        WHERE "userId" = ${userId}
        GROUP BY EXTRACT(HOUR FROM "playedAt")
        ORDER BY hour ASC
      `,

      // Distinct days with any activity (for streak calculation, last 90 days)
      prisma.$queryRaw<Array<{ day: string }>>`
        SELECT DISTINCT DATE("playedAt") AS day
        FROM "PlayHistory"
        WHERE "userId" = ${userId}
          AND "playedAt" >= ${new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)}
        ORDER BY day DESC
      `,

      // Daily credit usage last 30 days
      prisma.$queryRaw<Array<{ date: string; credits: bigint; count: bigint }>>`
        SELECT DATE("createdAt") AS date, SUM("creditCost")::bigint AS credits, COUNT(*)::bigint AS count
        FROM "CreditUsage"
        WHERE "userId" = ${userId}
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,

      // Total credits used all time
      prisma.creditUsage.aggregate({
        where: { userId },
        _sum: { creditCost: true },
      }),
    ]);

    // ── Listening time ──────────────────────────────────────────────────────
    let totalListeningTimeSec = 0;
    const dailyListeningMap: Record<string, number> = {};
    for (const entry of playHistoryForTime) {
      const dur = entry.song.duration ?? 0;
      totalListeningTimeSec += dur;
      const dateStr = entry.playedAt.toISOString().slice(0, 10);
      dailyListeningMap[dateStr] = (dailyListeningMap[dateStr] ?? 0) + dur;
    }

    // Fill in 30-day chart
    const dailyListeningTime: Array<{ date: string; seconds: number; minutes: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const sec = dailyListeningMap[dateStr] ?? 0;
      dailyListeningTime.push({ date: dateStr, seconds: sec, minutes: Math.round(sec / 60) });
    }

    // ── Peak hours heatmap ──────────────────────────────────────────────────
    const peakHours = Array.from({ length: 24 }, (_, h) => {
      const match = playHistoryByHour.find((r) => Number(r.hour) === h);
      return { hour: h, count: match ? Number(match.count) : 0 };
    });

    // ── Streak calculation ──────────────────────────────────────────────────
    const activeDays = dailyActivity.map((r) =>
      new Date(r.day).toISOString().slice(0, 10)
    );
    // Sort descending (already is)
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

    let currentStreak = 0;
    if (activeDays.includes(todayStr) || activeDays.includes(yesterdayStr)) {
      const startDay = activeDays.includes(todayStr) ? todayStr : yesterdayStr;
      let checkDate = new Date(startDay);
      while (true) {
        const checkStr = checkDate.toISOString().slice(0, 10);
        if (!activeDays.includes(checkStr)) break;
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      }
    }

    // Longest streak (brute force over 90 days)
    let longestStreak = 0;
    let runningStreak = 0;
    const activeDaysSet = new Set(activeDays);
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

    // ── Genre/style breakdown ───────────────────────────────────────────────
    const genreCounts: Record<string, number> = {};
    for (const song of allSongsWithTags) {
      if (!song.tags) continue;
      for (const raw of song.tags.split(",")) {
        const genre = raw.trim().toLowerCase();
        if (genre) genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
      }
    }
    const favoriteGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre, count]) => ({ genre, count }));

    // ── Trends ──────────────────────────────────────────────────────────────
    const weekTrend = songsThisWeek - songsLastWeek;
    const monthTrend = songsThisMonth - songsLastMonth;

    // ── Success rate ────────────────────────────────────────────────────────
    const successRate =
      totalSongsGenerated > 0
        ? Math.round((completedGenerations / totalSongsGenerated) * 100)
        : 0;

    // ── Credit usage chart (fill gaps) ─────────────────────────────────────
    const creditMap: Record<string, { credits: number; count: number }> = {};
    for (const row of creditStats) {
      const dateStr = new Date(row.date).toISOString().slice(0, 10);
      creditMap[dateStr] = { credits: Number(row.credits), count: Number(row.count) };
    }
    const creditUsageByDay: Array<{ date: string; credits: number; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const entry = creditMap[dateStr] ?? { credits: 0, count: 0 };
      creditUsageByDay.push({ date: dateStr, ...entry });
    }

    // ── Activity this week (last 7 days) ────────────────────────────────────
    const playCountThisWeek = playHistoryForTime.filter(
      (e) => e.playedAt >= sevenDaysAgo
    ).length;

    return NextResponse.json({
      totalSongsGenerated,
      completedGenerations,
      successRate,
      totalListeningTimeSec: Math.round(totalListeningTimeSec),
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
    });
  } catch (error) {
    logServerError("GET /api/stats/user", error, { route: "/api/stats/user" });
    return internalError();
  }
}
