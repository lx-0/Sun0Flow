import { prisma } from "@/lib/prisma";
import { gatherUserSignals } from "@/lib/user-signals";
import { computeCentroid } from "@/lib/embeddings";
import { rankCandidates } from "./rank-candidates";
import { coldStartFallback } from "./cold-start";
import type { RecommendationOptions, RecommendationResult } from "./types";

export type { RecommendationOptions, RecommendationResult, RecommendedSong } from "./types";
export { getDailyMix } from "./daily-mix";

const SIGNAL_SONGS_LIMIT = 30;

async function gatherSignalIds(userId: string): Promise<Set<string>> {
  const [signals, recentGenerated] = await Promise.all([
    gatherUserSignals(userId, { limit: SIGNAL_SONGS_LIMIT }),
    prisma.song.findMany({
      where: { userId, generationStatus: "ready", archivedAt: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
  ]);

  for (const s of recentGenerated) {
    signals.songIds.add(s.id);
  }

  return signals.songIds;
}

async function computeTasteProfile(signalIds: Set<string>): Promise<number[] | null> {
  if (signalIds.size === 0) return null;

  const signalEmbeddings = await prisma.songEmbedding.findMany({
    where: { songId: { in: Array.from(signalIds) } },
    select: { embedding: true },
  });

  const vectors = signalEmbeddings
    .map((e) => e.embedding as unknown as number[])
    .filter((v) => Array.isArray(v) && v.length > 0);

  return computeCentroid(vectors);
}

export async function getRecommendations(options: RecommendationOptions): Promise<RecommendationResult> {
  const { userId, limit, excludeIds } = options;

  const signalIds = await gatherSignalIds(userId);
  const queryVector = await computeTasteProfile(signalIds);

  if (!queryVector) {
    return coldStartFallback(userId, excludeIds, limit);
  }

  return rankCandidates(userId, queryVector, signalIds, excludeIds, limit);
}
