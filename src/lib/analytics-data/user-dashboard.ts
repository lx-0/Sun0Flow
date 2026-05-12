import { prisma } from "@/lib/prisma";
import { fillDailySeries } from "@/lib/date-series";
import { countGenres } from "@/lib/tags";

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
    tagSongs,
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
    topTags: countGenres(tagSongs, 5).map((r) => ({ tag: r.genre, count: r.count })),
    recentSongs,
  };
}

export interface UserDashboardStats {
  totalGenerations: number;
  completedGenerations: number;
  totalFavorites: number;
  totalPlaylists: number;
  averageRating: number | null;
  ratedSongsCount: number;
  userRatingAverage: number | null;
  userRatedSongsCount: number;
  genreBreakdown: Array<{ genre: string; count: number }>;
  topSongs: Array<{
    id: string;
    title: string | null;
    tags: string | null;
    downloadCount: number;
    rating: number | null;
    createdAt: string;
  }>;
  dailyGenerations: Array<{ date: string; count: number }>;
}

export async function getUserDashboardStats(userId: string): Promise<UserDashboardStats> {
  const [
    totalGenerations,
    completedGenerations,
    totalFavorites,
    totalPlaylists,
    ratingAgg,
    userRatingAgg,
    allTagSongs,
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

    prisma.song.findMany({
      where: { userId, tags: { not: null } },
      select: { tags: true },
    }),

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

    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*)::bigint as count
      FROM "Song"
      WHERE "userId" = ${userId}
        AND "createdAt" >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return {
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
    genreBreakdown: countGenres(allTagSongs, 10),
    topSongs: topSongs.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
    dailyGenerations: fillDailySeries(dailyGenerations, 30),
  };
}
