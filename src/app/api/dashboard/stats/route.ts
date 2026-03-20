import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Date boundaries
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all queries in parallel
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
      // Total songs
      prisma.song.count({ where: { userId } }),

      // Total favorites
      prisma.song.count({ where: { userId, isFavorite: true } }),

      // Total playlists
      prisma.playlist.count({ where: { userId } }),

      // Songs this week
      prisma.song.count({
        where: { userId, createdAt: { gte: startOfWeek } },
      }),

      // Songs this month
      prisma.song.count({
        where: { userId, createdAt: { gte: startOfMonth } },
      }),

      // Average rating (across songs with a rating)
      prisma.song.aggregate({
        where: { userId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      }),

      // Top 5 tags — flatten comma-separated tags, count occurrences
      prisma.song.findMany({
        where: { userId, tags: { not: null } },
        select: { tags: true },
      }),

      // 5 most recent ready songs
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

    // Compute top 5 tags from raw data
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

    return NextResponse.json({
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
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
