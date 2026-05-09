import { prisma } from "@/lib/prisma";

export interface DashboardStats {
  totalSongs: number;
  totalFavorites: number;
  totalPlaylists: number;
  songsThisWeek: number;
  songsThisMonth: number;
  averageRating: number | null;
  ratedSongsCount: number;
  topTags: Array<{ tag: string; count: number }>;
  recentSongs: Array<{
    id: string;
    title: string | null;
    imageUrl: string | null;
    tags: string | null;
    duration: number | null;
    createdAt: Date;
  }>;
}

function startOfWeek(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getDashboardStats(
  userId: string,
): Promise<DashboardStats> {
  const weekStart = startOfWeek();
  const monthStart = startOfMonth();

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
      where: { userId, createdAt: { gte: weekStart } },
    }),
    prisma.song.count({
      where: { userId, createdAt: { gte: monthStart } },
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
    topTags: topTags
      .filter((r) => r.tag)
      .map((r) => ({ tag: r.tag, count: Number(r.count) })),
    recentSongs,
  };
}
