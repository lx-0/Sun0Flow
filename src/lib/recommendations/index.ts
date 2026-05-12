import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { gatherSignalIds, computeTasteProfile, rankCandidates, coldStartFallback } from "./rank";
import { getAlsoLiked as getAlsoLikedCore } from "./also-liked";
import { getSimilarSongs as getSimilarSongsCore, findSimilarByEmbedding as findSimilarByEmbeddingCore } from "./similarity";
import { getRelatedSongs as getRelatedSongsCore } from "./related";
import { getDailyMix as getDailyMixCore } from "./daily-mix";

// --- Barrel re-exports (types + utilities only) ---

export type { SimilarSong, EmbeddingSimilarityResult } from "./similarity";
export type { RelatedSong, RelatedResult } from "./related";
export type { BaseSongResult, RecommendedSong, RecommendationResult } from "./format";
export { formatBaseSong, formatSong } from "./format";
export { seededShuffle } from "./daily-mix";

// --- Public types ---

export interface RecommendationOptions {
  userId: string;
  limit: number;
  excludeIds: Set<string>;
}

// --- Cached public API ---
// Caching is concentrated here so route handlers stay thin delegation layers.

function hourBucket(): string {
  return String(Math.floor(Date.now() / 3_600_000));
}

export async function getRecommendations(options: RecommendationOptions): Promise<import("./format").RecommendationResult> {
  const { userId, limit, excludeIds } = options;
  const key = cacheKey("recommendations-v1", userId, hourBucket(), String(limit));

  return cached(key, async () => {
    const signalIds = await gatherSignalIds(userId);
    const queryVector = await computeTasteProfile(signalIds);
    if (!queryVector) return coldStartFallback(userId, excludeIds, limit);
    return rankCandidates(userId, queryVector, signalIds, excludeIds, limit);
  }, CacheTTL.RECOMMENDATIONS);
}

export async function getSimilarSongs(songId: string, userId: string, limit: number) {
  const key = cacheKey("similar-songs", userId, songId, String(limit));
  return cached(key, () => getSimilarSongsCore(songId, userId, limit), CacheTTL.RECOMMENDATIONS);
}

export async function findSimilarByEmbedding(songId: string, userId: string, limit: number) {
  const key = cacheKey("similar-embeddings-v1", userId, songId, String(limit));
  return cached(key, () => findSimilarByEmbeddingCore(songId, userId, limit), CacheTTL.RECOMMENDATIONS);
}

export async function getRelatedSongs(songId: string, limit: number) {
  const key = cacheKey("related-songs", songId, String(limit));
  return cached(key, () => getRelatedSongsCore(songId, limit), CacheTTL.RECOMMENDATIONS);
}

export async function getAlsoLiked(songId: string, userId: string, limit: number) {
  const key = cacheKey("also-liked", userId, songId, String(limit));
  return cached(key, () => getAlsoLikedCore(songId, userId, limit), CacheTTL.RECOMMENDATIONS);
}

export async function getDailyMix(userId: string, limit?: number) {
  const key = cacheKey("daily-recommendations", userId, hourBucket());
  return cached(key, () => getDailyMixCore(userId, limit), CacheTTL.RECOMMENDATIONS);
}
