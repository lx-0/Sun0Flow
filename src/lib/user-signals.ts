import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

export interface UserSignals {
  songIds: Set<string>;
  tagWeights: Map<string, number>;
}

const DEFAULT_LIMIT = 50;

const WEIGHT_FAVORITE = 3;
const WEIGHT_HIGH_RATED = 2;
const WEIGHT_PLAY = 1;

export async function gatherUserSignals(
  userId: string,
  opts?: { limit?: number },
): Promise<UserSignals> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;

  const [favorites, highRated, recentPlays] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId },
      select: { songId: true, song: { select: { tags: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.song.findMany({
      where: { userId, rating: { gte: 4 }, archivedAt: null },
      select: { id: true, tags: true },
      orderBy: { rating: "desc" },
      take: limit,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      select: { songId: true, song: { select: { tags: true } } },
      orderBy: { playedAt: "desc" },
      take: limit,
    }),
  ]);

  const songIds = new Set<string>();
  const tagWeights = new Map<string, number>();

  function addSignal(songId: string, tags: string | null, weight: number) {
    songIds.add(songId);
    for (const tag of parseTags(tags)) {
      tagWeights.set(tag, (tagWeights.get(tag) ?? 0) + weight);
    }
  }

  for (const f of favorites) {
    addSignal(f.songId, f.song?.tags ?? null, WEIGHT_FAVORITE);
  }
  for (const s of highRated) {
    addSignal(s.id, s.tags, WEIGHT_HIGH_RATED);
  }
  for (const p of recentPlays) {
    addSignal(p.songId, p.song?.tags ?? null, WEIGHT_PLAY);
  }

  return { songIds, tagWeights };
}
