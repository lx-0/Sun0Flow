import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  try {
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

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
      prisma.song.count({ where: { userId } }),

      prisma.song.count({ where: { userId, generationStatus: "ready" } }),

      prisma.song.count({ where: { userId, generationStatus: "failed" } }),

      prisma.favorite.count({ where: { userId } }),

      prisma.song.aggregate({
        where: { userId, generationStatus: "ready", duration: { not: null } },
        _sum: { duration: true },
      }),

      // All songs with tags for genre breakdown
      prisma.song.findMany({
        where: { userId, tags: { not: null } },
        select: { tags: true },
      }),

      // Weekly generation counts (last 12 weeks)
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

      // Songs with prompts for "best prompts" analysis
      prisma.song.findMany({
        where: {
          userId,
          generationStatus: "ready",
          prompt: { not: null },
        },
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

    // Genre breakdown from comma-separated tags
    const genreCounts: Record<string, number> = {};
    for (const song of allTagSongs) {
      if (!song.tags) continue;
      for (const raw of song.tags.split(",")) {
        const genre = raw.trim().toLowerCase();
        if (genre) {
          genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        }
      }
    }
    const genreBreakdown = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([genre, count]) => ({ genre, count }));

    // Weekly activity: build full 12-week series
    const weeklyActivity: Array<{ week: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const dayOfWeek = d.getDay();
      const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      d.setDate(d.getDate() + diffToMon);
      d.setHours(0, 0, 0, 0);
      const weekStr = d.toISOString().slice(0, 10);
      const match = weeklyRaw.find(
        (r) => new Date(r.week).toISOString().slice(0, 10) === weekStr
      );
      weeklyActivity.push({ week: weekStr, count: match ? Number(match.count) : 0 });
    }

    // Best prompts: deduplicate by normalized prompt, score by favorites + plays
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

    return NextResponse.json({
      totalSongs,
      completedSongs,
      failedSongs,
      successRate: totalSongs > 0 ? Math.round((completedSongs / totalSongs) * 100) : null,
      totalFavorites,
      totalPlayTimeSec: durationAgg._sum.duration
        ? Math.round(durationAgg._sum.duration)
        : 0,
      genreBreakdown,
      weeklyActivity,
      bestPrompts,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
