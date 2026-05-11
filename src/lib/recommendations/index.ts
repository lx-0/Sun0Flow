import { gatherSignalIds, computeTasteProfile } from "./taste-profile";
import { rankCandidates, coldStartFallback } from "./rank";

// --- Barrel re-exports (preserve all existing import paths) ---

export { getAlsoLiked } from "./also-liked";
export { getSimilarSongs, findSimilarByEmbedding } from "./similarity";
export type { SimilarSong, EmbeddingSimilarityResult } from "./similarity";
export { getRelatedSongs } from "./related";
export type { RelatedSong, RelatedResult } from "./related";
export { getDailyMix } from "./daily-mix";
export { seededShuffle } from "./daily-mix";
export type { BaseSongResult, RecommendedSong, RecommendationResult } from "./format";
export { formatBaseSong, formatSong } from "./format";

// --- Public types ---

export interface RecommendationOptions {
  userId: string;
  limit: number;
  excludeIds: Set<string>;
}

// --- Orchestration ---

export async function getRecommendations(options: RecommendationOptions): Promise<import("./format").RecommendationResult> {
  const { userId, limit, excludeIds } = options;

  const signalIds = await gatherSignalIds(userId);
  const queryVector = await computeTasteProfile(signalIds);

  if (!queryVector) {
    return coldStartFallback(userId, excludeIds, limit);
  }

  return rankCandidates(userId, queryVector, signalIds, excludeIds, limit);
}
