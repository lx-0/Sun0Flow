import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { cached, cacheKey, CacheTTL, CacheControl } from "@/lib/cache";

export async function GET(request: Request) {
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
          prisma.song.findMany({
            where: { userId, tags: { not: null } },
            select: { tags: true },
          }),
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

        const tagCounts: Record<string, number> = {};
        for (const song of topTags) {
          if (!song.tags) continue;
          for (const raw of song.tags.split(",")) {
            const tag = raw.trim().toLowerCase();
            if (tag) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }
        const topTagsList = Object.entries(tagCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([tag, count]) => ({ tag, count }));

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
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
