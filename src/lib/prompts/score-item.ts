import type { RssItem } from "@/lib/rss";

export function scoreItem(item: RssItem): number {
  let score = 0;
  if (item.mood && item.mood !== "neutral") score += 2;
  if (item.topics && item.topics.length > 0) score += item.topics.length;
  if (item.title && item.title.length > 10) score += 1;
  if (item.description && item.description.length > 20) score += 1;
  return score;
}

export function rankItems(items: RssItem[], limit: number): RssItem[] {
  return items
    .map((item) => ({ item, score: scoreItem(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
