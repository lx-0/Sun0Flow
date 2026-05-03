import { prisma } from "@/lib/prisma";

const SIGNAL_SONGS_LIMIT = 30;

export async function gatherSignalIds(userId: string): Promise<Set<string>> {
  const [favorites, highRated, recentPlayed, recentGenerated] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId },
      select: { songId: true },
      orderBy: { createdAt: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
    prisma.song.findMany({
      where: { userId, rating: { gte: 4 }, archivedAt: null },
      select: { id: true },
      orderBy: { rating: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      select: { songId: true },
      orderBy: { playedAt: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
    prisma.song.findMany({
      where: { userId, generationStatus: "ready", archivedAt: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
  ]);

  return new Set<string>([
    ...favorites.map((f) => f.songId),
    ...highRated.map((s) => s.id),
    ...recentPlayed.map((p) => p.songId),
    ...recentGenerated.map((s) => s.id),
  ]);
}
