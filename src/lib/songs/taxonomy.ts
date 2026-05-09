import { prisma } from "@/lib/prisma";
import { CacheTTL, cached, cacheKey } from "@/lib/cache";
import { SongFilters } from "./index";

export interface TagCount {
  name: string;
  count: number;
}

const FALLBACK_GENRES: TagCount[] = [
  "Pop", "Rock", "Hip-Hop", "Electronic", "Jazz",
  "Classical", "R&B", "Country", "Lo-Fi", "Ambient",
  "Metal", "Folk", "Indie", "Funk", "Soul",
].map((name) => ({ name, count: 0 }));

const FALLBACK_MOODS: TagCount[] = [
  "Energetic", "Chill", "Dark", "Uplifting", "Melancholic",
  "Dreamy", "Epic", "Relaxed", "Happy", "Romantic",
].map((name) => ({ name, count: 0 }));

const MOOD_KEYWORDS = new Set([
  "energetic", "chill", "dark", "uplifting", "melancholic", "aggressive",
  "relaxed", "happy", "sad", "epic", "dreamy", "intense", "romantic",
  "mysterious", "peaceful", "angry", "nostalgic", "euphoric", "somber",
  "atmospheric", "hypnotic", "groovy", "emotional", "powerful", "calm",
]);

function tokenizeTags(raw: string, separator: RegExp): string[] {
  return raw.split(separator).map((t) => t.trim().toLowerCase()).filter(Boolean);
}

async function fetchPublicTags(): Promise<{ tags: string }[]> {
  return prisma.song.findMany({
    where: { ...SongFilters.publicDiscovery(), tags: { not: null } },
    select: { tags: true },
  }) as Promise<{ tags: string }[]>;
}

function countTokens(
  rows: { tags: string }[],
  separator: RegExp,
  filter?: (token: string) => boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const token of tokenizeTags(row.tags, separator)) {
      if (filter && !filter(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

function topN(counts: Map<string, number>, n: number): TagCount[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
    }));
}

export async function getTopGenres(): Promise<TagCount[]> {
  const key = cacheKey("genres", "top15");
  return cached(
    key,
    async () => {
      const rows = await fetchPublicTags();
      const counts = countTokens(rows, /[,;]+/);
      return counts.size === 0 ? FALLBACK_GENRES : topN(counts, 15);
    },
    CacheTTL.DISCOVER,
  );
}

export async function getTopMoods(): Promise<TagCount[]> {
  const key = cacheKey("moods", "top10");
  return cached(
    key,
    async () => {
      const rows = await fetchPublicTags();
      const counts = countTokens(rows, /[,;\s]+/, (t) => MOOD_KEYWORDS.has(t));
      return counts.size === 0 ? FALLBACK_MOODS : topN(counts, 10);
    },
    CacheTTL.DISCOVER,
  );
}
