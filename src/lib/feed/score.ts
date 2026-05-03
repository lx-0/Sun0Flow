export function trendingScore(
  playCount: number,
  downloadCount: number,
  createdAt: Date,
): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return (playCount + downloadCount * 2) / (1 + ageDays * 0.1);
}

export function affinityScore(
  songTags: string[],
  preferredTags: Map<string, number>,
): number {
  if (preferredTags.size === 0 || songTags.length === 0) return 0;
  let score = 0;
  for (const tag of songTags) {
    score += preferredTags.get(tag) ?? 0;
  }
  return score;
}
