import { prisma } from "@/lib/prisma";
import { fetchFeed } from "@/lib/rss";

export interface DigestItem {
  source: "rss";
  title: string;
  link?: string;
  mood: string;
  topics: string[];
  suggestedPrompt: string;
  feedTitle?: string;
}

const MAX_DIGESTS_PER_USER = 10;
const MAX_FEEDS = 5;
const MAX_ITEMS_PER_FEED = 3;
const MAX_TOTAL_ITEMS = 15;
const PICKS_MIN = 3;
const PICKS_MAX = 5;
const MAX_PER_SOURCE = 2;

export function buildPrompt(
  title: string,
  mood: string,
  topics: string[],
): string {
  const parts: string[] = [];
  if (mood && mood !== "neutral") parts.push(`${mood} vibe`);
  if (topics.length > 0) parts.push(topics.slice(0, 3).join(", "));
  if (title && title.length > 5 && title.length < 80)
    parts.push(`"${title}"`);
  return parts.length > 0 ? parts.join(" — ") : title.slice(0, 100);
}

function sourceKey(item: DigestItem): string {
  return item.feedTitle ?? "unknown";
}

export function selectPicks(allItems: DigestItem[]): DigestItem[] {
  const selected: DigestItem[] = [];
  const usedMoods = new Set<string>();
  const sourceCount = new Map<string, number>();

  function canAdd(item: DigestItem): boolean {
    return (sourceCount.get(sourceKey(item)) ?? 0) < MAX_PER_SOURCE;
  }

  function addItem(item: DigestItem) {
    selected.push(item);
    usedMoods.add(item.mood);
    const src = sourceKey(item);
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
  }

  for (const item of allItems) {
    if (selected.length >= PICKS_MAX) break;
    if (!usedMoods.has(item.mood) && canAdd(item)) {
      addItem(item);
    }
  }

  for (const item of allItems) {
    if (selected.length >= PICKS_MAX) break;
    if (!selected.includes(item) && canAdd(item)) {
      addItem(item);
    }
  }

  if (selected.length < PICKS_MIN) {
    for (const item of allItems) {
      if (selected.length >= PICKS_MIN) break;
      if (!selected.includes(item)) {
        addItem(item);
      }
    }
  }

  return selected;
}

interface FeedSource {
  url: string;
  title: string | null;
}

async function collectItems(feeds: FeedSource[]): Promise<DigestItem[]> {
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

export async function generateDigest(userId: string) {
  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId },
    take: MAX_FEEDS,
    orderBy: { createdAt: "asc" },
    select: { url: true, title: true },
  });

  if (feeds.length === 0) return null;

  const allItems = await collectItems(feeds);
  if (allItems.length === 0) return null;

  const selected = selectPicks(allItems);

  const now = new Date();
  const title = `Today's Picks — ${now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;

  const digest = await prisma.inspirationDigest.create({
    data: {
      userId,
      title,
      items: selected as object[],
    },
  });

  const oldest = await prisma.inspirationDigest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    skip: MAX_DIGESTS_PER_USER,
    select: { id: true },
  });
  if (oldest.length > 0) {
    await prisma.inspirationDigest.deleteMany({
      where: { id: { in: oldest.map((d) => d.id) } },
    });
  }

  return { ...digest, items: selected };
}
