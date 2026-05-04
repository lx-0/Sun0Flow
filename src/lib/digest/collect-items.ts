import { fetchFeed } from "@/lib/rss";
import { buildPrompt } from "./build-prompt";
import type { DigestItem } from "./types";
import { MAX_ITEMS_PER_FEED, MAX_TOTAL_ITEMS } from "./types";

interface FeedSource {
  url: string;
  title: string | null;
}

export async function collectItems(feeds: FeedSource[]): Promise<DigestItem[]> {
  const allItems: DigestItem[] = [];
  const seenLinks = new Set<string>();

  for (const feed of feeds) {
    const result = await fetchFeed(feed.url);
    if (result.error || result.items.length === 0) continue;

    const feedTitle = feed.title ?? result.feedTitle;
    const picked = result.items.slice(0, MAX_ITEMS_PER_FEED);

    for (const item of picked) {
      if (allItems.length >= MAX_TOTAL_ITEMS) break;
      if (item.link && seenLinks.has(item.link)) continue;
      if (item.link) seenLinks.add(item.link);

      const mood = item.mood ?? "neutral";
      const topics = item.topics ?? [];
      allItems.push({
        source: "rss",
        title: item.title,
        link: item.link,
        mood,
        topics,
        suggestedPrompt: buildPrompt(item.title, mood, topics),
        feedTitle,
      });
    }
  }

  return allItems;
}
