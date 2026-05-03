import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

export type TasteProfile = Map<string, number>;

export async function buildTasteProfile(
  userId: string,
): Promise<TasteProfile> {
  const [favoriteSongs, highRatedSongs, recentPlays] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId },
      select: { song: { select: { tags: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.song.findMany({
      where: { userId, rating: { gte: 4 }, archivedAt: null },
      select: { tags: true },
      orderBy: { rating: "desc" },
      take: 30,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      select: { song: { select: { tags: true } } },
      orderBy: { playedAt: "desc" },
      take: 50,
    }),
  ]);

  const weights: TasteProfile = new Map();
  const addWeights = (tagsStr: string | null, weight: number) => {
    for (const t of parseTags(tagsStr)) {
      weights.set(t, (weights.get(t) ?? 0) + weight);
    }
  };
  favoriteSongs.forEach((f) => addWeights(f.song?.tags ?? null, 3));
  highRatedSongs.forEach((s) => addWeights(s.tags, 2));
  recentPlays.forEach((p) => addWeights(p.song?.tags ?? null, 1));

  return weights;
}
