import type { TrendingCandidate } from "./types";

const MAX_RECOMMENDATIONS = 5;

export function selectRecommendations(
  pool: TrendingCandidate[],
  excludeUserId: string
): Array<{ id: string; title: string | null; tags: string | null }> {
  return pool
    .filter((s) => s.userId !== excludeUserId)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((s) => ({ id: s.id, title: s.title, tags: s.tags }));
}
