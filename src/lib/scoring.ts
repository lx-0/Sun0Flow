const TRENDING_DECAY = 0.1;
const SECONDARY_MULTIPLIER = 2;

export function trendingScore(
  primaryMetric: number,
  secondaryMetric: number,
  timestamp: Date,
): number {
  const ageDays =
    (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  return (
    (primaryMetric + secondaryMetric * SECONDARY_MULTIPLIER) /
    (1 + ageDays * TRENDING_DECAY)
  );
}
