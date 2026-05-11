import { prisma } from "@/lib/prisma";
import { countGenres } from "@/lib/tags";
import { dateRangeStart, fillWeeklySeries } from "@/lib/date-series";
import {
  songCount,
  completedSongCount,
  favoriteCount,
  tagSongs,
} from "./queries";

export interface GenerationInsights {
  totalSongs: number;
  completedSongs: number;
  failedSongs: number;
  successRate: number | null;
  totalFavorites: number;
  totalPlayTimeSec: number;
  genreBreakdown: Array<{ genre: string; count: number }>;
  weeklyActivity: Array<{ week: string; count: number }>;
  bestPrompts: Array<{ prompt: string; favCount: number; plays: number; uses: number }>;
}

export async function getGenerationInsights(userId: string): Promise<GenerationInsights> {
  const twelveWeeksAgo = dateRangeStart(84);

  const [
    totalSongs,
    completedSongs,
    failedSongs,
    totalFavorites,
    durationAgg,
    allTagSongs,
    weeklyRaw,
    bestPromptSongs,
  ] = await Promise.all([
    songCount(userId),
    completedSongCount(userId),
    prisma.song.count({ where: { userId, generationStatus: "failed" } }),
    favoriteCount(userId),

    prisma.song.aggregate({
      where: { userId, generationStatus: "ready", duration: { not: null } },
      _sum: { duration: true },
    }),

    tagSongs(userId),

    prisma.$queryRaw<Array<{ week: Date; count: bigint }>>`
      SELECT
        DATE_TRUNC('week', "createdAt") AS week,
        COUNT(*) AS count
      FROM "Song"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${twelveWeeksAgo}
      GROUP BY week
      ORDER BY week ASC
    `,

    prisma.song.findMany({
      where: { userId, generationStatus: "ready", prompt: { not: null } },
      select: {
        prompt: true,
        isFavorite: true,
        playCount: true,
        _count: { select: { favorites: true } },
      },
      orderBy: [{ playCount: "desc" }],
      take: 200,
    }),
  ]);

  const weeklyActivity = fillWeeklySeries(weeklyRaw, 12);

  const promptMap: Record<
    string,
    { prompt: string; favCount: number; plays: number; uses: number }
  > = {};
  for (const song of bestPromptSongs) {
    if (!song.prompt) continue;
    const key = song.prompt.trim().toLowerCase().slice(0, 300);
    if (!promptMap[key]) {
      promptMap[key] = { prompt: song.prompt, favCount: 0, plays: 0, uses: 0 };
    }
    promptMap[key].favCount += song._count.favorites + (song.isFavorite ? 1 : 0);
    promptMap[key].plays += song.playCount;
    promptMap[key].uses++;
  }
  const bestPrompts = Object.values(promptMap)
    .filter((p) => p.favCount > 0 || p.plays > 0)
    .sort((a, b) => b.favCount * 3 + b.plays - (a.favCount * 3 + a.plays))
    .slice(0, 8)
    .map(({ prompt, favCount, plays, uses }) => ({ prompt, favCount, plays, uses }));

  return {
    totalSongs,
    completedSongs,
    failedSongs,
    successRate: totalSongs > 0 ? Math.round((completedSongs / totalSongs) * 100) : null,
    totalFavorites,
    totalPlayTimeSec: durationAgg._sum.duration ? Math.round(durationAgg._sum.duration) : 0,
    genreBreakdown: countGenres(allTagSongs),
    weeklyActivity,
    bestPrompts,
  };
}
