import { gatherSignalIds } from "./gather-signals";
import { computeTasteProfile } from "./taste-profile";
import { rankCandidates } from "./rank-candidates";
import { coldStartFallback } from "./cold-start";
import type { RecommendationOptions, RecommendationResult } from "./types";

export type { RecommendationOptions, RecommendationResult, RecommendedSong } from "./types";
export { getDailyMix } from "./daily-mix";

export async function getRecommendations(options: RecommendationOptions): Promise<RecommendationResult> {
  const { userId, limit, excludeIds } = options;

  const signalIds = await gatherSignalIds(userId);
  const queryVector = await computeTasteProfile(signalIds);

  if (!queryVector) {
    return coldStartFallback(userId, excludeIds, limit);
  }

  return rankCandidates(userId, queryVector, signalIds, excludeIds, limit);
}
