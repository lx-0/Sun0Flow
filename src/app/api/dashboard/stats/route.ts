import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, cacheKey, CacheTTL, CacheControl } from "@/lib/cache";
import { withTiming } from "@/lib/timing";

async function handleGET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Date boundaries
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all queries in parallel (cached per user for 30s)
    const stats = await cached(
      cacheKey("dashboard-stats", userId),
      async () => {
        const [
          totalSongs,
          totalFavorites,
          totalPlaylists,
          songsThisWeek,
          songsThisMonth,
          ratingAgg,
          topTags,
          recentSongs,
        ] = await Promise.all([
          prisma.song.count({ where: { userId } }),
          prisma.song.count({ where: { userId, isFavorite: true } }),
          prisma.playlist.count({ where: { userId } }),
          prisma.song.count({
            where: { userId, createdAt: { gte: startOfWeek } },
          }),
          prisma.song.count({
            where: { userId, createdAt: { gte: startOfMonth } },
          }),
          prisma.song.aggregate({
            where: { userId, rating: { not: null } },
            _avg: { rating: true },
            _count: { rating: true },
          }),
          prisma.$queryRaw<Array<{ tag: string; count: bigint }>>`
            SELECT trim(lower(unnest(string_to_array(tags, ',')))) AS tag, COUNT(*)::bigint AS count
            FROM "Song"
            WHERE "userId" = ${userId} AND tags IS NOT NULL AND tags <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 5
          `,
          prisma.song.findMany({
            where: { userId, generationStatus: "ready" },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              title: true,
              imageUrl: true,
              tags: true,
              duration: true,
              createdAt: true,
            },
          }),
        ]);

        const topTagsList = topTags
          .filter((r) => r.tag)
          .map((r) => ({ tag: r.tag, count: Number(r.count) }));

        return {
          totalSongs,
          totalFavorites,
          totalPlaylists,
          songsThisWeek,
          songsThisMonth,
          averageRating: ratingAgg._avg.rating
            ? Math.round(ratingAgg._avg.rating * 10) / 10
            : null,
          ratedSongsCount: ratingAgg._count.rating,
          topTags: topTagsList,
          recentSongs,
        };
      },
      CacheTTL.DASHBOARD_STATS
    );

    return NextResponse.json(stats, {
      headers: { "Cache-Control": CacheControl.privateShort },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export const GET = withTiming("/api/dashboard/stats", handleGET);
