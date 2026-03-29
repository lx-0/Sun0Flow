import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

  const [
    totalGenerations,
    completedGenerations,
    totalFavorites,
    totalPlaylists,
    ratingAgg,
    userRatingAgg,
    genreRows,
    topSongs,
    dailyGenerations,
  ] = await Promise.all([
    prisma.song.count({ where: { userId } }),

    prisma.song.count({
      where: { userId, generationStatus: "ready" },
    }),

    prisma.favorite.count({ where: { userId } }),

    prisma.playlist.count({ where: { userId } }),

    prisma.song.aggregate({
      where: { userId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),

    prisma.rating.aggregate({
      where: { userId },
      _avg: { value: true },
      _count: { value: true },
    }),

    // Genre breakdown via SQL aggregation (avoids fetching all song rows into JS)
    prisma.$queryRaw<Array<{ genre: string; count: bigint }>>`
      SELECT trim(lower(unnest(string_to_array(tags, ',')))) AS genre, COUNT(*)::bigint AS count
      FROM "Song"
      WHERE "userId" = ${userId} AND tags IS NOT NULL AND tags <> ''
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,

    // Most-played/downloaded songs
    prisma.song.findMany({
      where: { userId, generationStatus: "ready" },
      orderBy: { downloadCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        tags: true,
        downloadCount: true,
        rating: true,
        createdAt: true,
      },
    }),

    // Daily generation counts for last 30 days
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM "Song"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  const genreBreakdown = genreRows
    .filter((r) => r.genre)
    .map((r) => ({ genre: r.genre, count: Number(r.count) }));

  // Fill in missing dates for chart
  const chartData: Array<{ date: string; count: number }> = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const match = dailyGenerations.find(
      (r) => new Date(r.date).toISOString().slice(0, 10) === dateStr
    );
    chartData.push({ date: dateStr, count: match ? Number(match.count) : 0 });
  }

  return NextResponse.json({
    totalGenerations,
    completedGenerations,
    totalFavorites,
    totalPlaylists,
    averageRating: ratingAgg._avg.rating
      ? Math.round(ratingAgg._avg.rating * 10) / 10
      : null,
    ratedSongsCount: ratingAgg._count.rating,
    userRatingAverage: userRatingAgg._avg.value
      ? Math.round(userRatingAgg._avg.value * 10) / 10
      : null,
    userRatedSongsCount: userRatingAgg._count.value,
    genreBreakdown,
    topSongs: topSongs.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    dailyGenerations: chartData,
  });
}
