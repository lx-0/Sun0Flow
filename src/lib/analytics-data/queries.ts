import { prisma } from "@/lib/prisma";

export const songCount = (userId: string) =>
  prisma.song.count({ where: { userId } });

export const completedSongCount = (userId: string) =>
  prisma.song.count({ where: { userId, generationStatus: "ready" } });

export const playlistCount = (userId: string) =>
  prisma.playlist.count({ where: { userId } });

export const favoriteCount = (userId: string) =>
  prisma.favorite.count({ where: { userId } });

export const songRatingAgg = (userId: string) =>
  prisma.song.aggregate({
    where: { userId, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });

export const tagSongs = (userId: string) =>
  prisma.song.findMany({
    where: { userId, tags: { not: null } },
    select: { tags: true },
  });

export function roundToOneDecimal(n: number | null): number | null {
  return n ? Math.round(n * 10) / 10 : null;
}
