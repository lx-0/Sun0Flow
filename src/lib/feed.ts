import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { SongFilters, SongSelect } from "@/lib/songs";

export type FeedReason =
  | "recommended"
  | "followed_artist"
  | "trending"
  | "new_release";

export interface FeedItem {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  creatorDisplayName: string;
  creatorUsername: string | null;
  creatorUserId: string;
  reason: FeedReason;
  reasonLabel: string;
}

export interface FeedFilters {
  tag?: string;
  mood?: string;
}

export interface FeedResult {
  items: FeedItem[];
  strategy: "personalized" | "trending_fallback";
}

const PAGE_SIZE = 20;
const BUCKET_SIZE = 60;

const songPublicSelect = SongSelect.public;

type SongRow = {
  id: string;
  userId: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  downloadCount: number;
  publicSlug: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null };
};

function trendingScore(playCount: number, downloadCount: number, createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return (playCount + downloadCount * 2) / (1 + ageDays * 0.1);
}

function parseTags(tags: string | null): Set<string> {
  if (!tags) return new Set();
  return new Set(
    tags
      .split(/[,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );
}

function affinityScore(songTags: Set<string>, preferredTags: Map<string, number>): number {
  if (preferredTags.size === 0 || songTags.size === 0) return 0;
  let score = 0;
  songTags.forEach((tag) => {
    score += preferredTags.get(tag) ?? 0;
  });
  return score;
}

function baseWhere(filters: FeedFilters): Prisma.SongWhereInput {
  let where = SongFilters.publicDiscovery();
  const tags = [filters.tag, filters.mood].filter(Boolean) as string[];
  where = SongFilters.withTagContains(where, tags);
  return where;
}

function toFeedItem(song: SongRow, reason: FeedReason, reasonLabel: string): FeedItem {
  return {
    id: song.id,
    title: song.title,
    tags: song.tags,
    imageUrl: song.imageUrl,
    audioUrl: song.audioUrl,
    duration: song.duration,
    rating: song.rating,
    playCount: song.playCount,
    publicSlug: song.publicSlug,
    createdAt: song.createdAt.toISOString(),
    creatorDisplayName: song.user.name || song.user.username || "Unknown Artist",
    creatorUsername: song.user.username,
    creatorUserId: song.user.id,
    reason,
    reasonLabel,
  };
}

export function paginate(items: FeedItem[], page: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const start = (page - 1) * PAGE_SIZE;
  return {
    feed: items.slice(start, start + PAGE_SIZE),
    pagination: { page, totalPages, total, hasMore: page < totalPages },
  };
}

export async function buildAnonymousFeed(filters: FeedFilters): Promise<FeedItem[]> {
  const where = baseWhere(filters);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [trendingPool, newReleases] = await Promise.all([
    prisma.song.findMany({
      where: { ...where, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { playCount: "desc" },
      take: BUCKET_SIZE,
      select: songPublicSelect,
    }),
    prisma.song.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: BUCKET_SIZE,
      select: songPublicSelect,
    }),
  ]);

  const scoredTrending = trendingPool
    .map((s) => ({
      ...s,
      _score: trendingScore(s.playCount, s.downloadCount, s.createdAt),
    }))
    .sort((a, b) => b._score - a._score);

  const seen = new Set<string>();
  const merged: FeedItem[] = [];
  const maxLen = Math.max(scoredTrending.length, newReleases.length);
  for (let i = 0; i < maxLen; i++) {
    const t = scoredTrending[i];
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      merged.push(toFeedItem(t, "trending", "Trending"));
    }
    const n = newReleases[i];
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      merged.push(toFeedItem(n, "new_release", "New Release"));
    }
  }

  return merged;
}

export async function buildPersonalizedFeed(
  userId: string,
  filters: FeedFilters
): Promise<FeedResult> {
  const where = baseWhere(filters);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true, following: { select: { name: true, username: true } } },
  });
  const followedIds = follows.map((f) => f.followingId);
  const followedNames = new Map<string, string>(
    follows.map((f) => [
      f.followingId,
      f.following.name || f.following.username || "someone you follow",
    ])
  );

  const [favoriteSongs, highRatedSongs, recentPlays] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId },
      select: { song: { select: { tags: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.song.findMany({
      where: { userId, rating: { gte: 4 }, archivedAt: null },
      select: { tags: true },
      orderBy: { rating: "desc" },
      take: 30,
    }),
    prisma.playHistory.findMany({
      where: { userId },
      select: { song: { select: { tags: true } } },
      orderBy: { playedAt: "desc" },
      take: 50,
    }),
  ]);

  const tagWeights = new Map<string, number>();
  const addTagWeights = (tagsStr: string | null, weight: number) => {
    parseTags(tagsStr).forEach((t) => {
      tagWeights.set(t, (tagWeights.get(t) ?? 0) + weight);
    });
  };
  favoriteSongs.forEach((f) => addTagWeights(f.song?.tags ?? null, 3));
  highRatedSongs.forEach((s) => addTagWeights(s.tags, 2));
  recentPlays.forEach((p) => addTagWeights(p.song?.tags ?? null, 1));

  const hasHistory = tagWeights.size > 0;
  const strategy = hasHistory ? "personalized" : "trending_fallback" as const;

  const [followedSongs, trendingPool, newReleases] = await Promise.all([
    followedIds.length > 0
      ? prisma.song.findMany({
          where: {
            ...where,
            userId: { in: followedIds },
            createdAt: { gte: thirtyDaysAgo },
          },
          orderBy: { createdAt: "desc" },
          take: BUCKET_SIZE,
          select: songPublicSelect,
        })
      : Promise.resolve([]),
    prisma.song.findMany({
      where: { ...where, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { playCount: "desc" },
      take: BUCKET_SIZE,
      select: songPublicSelect,
    }),
    prisma.song.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: BUCKET_SIZE,
      select: songPublicSelect,
    }),
  ]);

  interface ScoredItem {
    item: FeedItem;
    score: number;
  }

  const seen = new Set<string>();
  const allScored: ScoredItem[] = [];

  for (const song of followedSongs) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const artistName = followedNames.get(song.userId) ?? song.user.name ?? "an artist you follow";
    const taff = affinityScore(parseTags(song.tags), tagWeights);
    allScored.push({
      item: toFeedItem(song, "followed_artist", `From ${artistName}`),
      score: 1000 + taff,
    });
  }

  const scoredTrending = trendingPool
    .map((s) => ({
      song: s,
      tScore: trendingScore(s.playCount, s.downloadCount, s.createdAt),
    }))
    .sort((a, b) => b.tScore - a.tScore);

  for (const { song, tScore } of scoredTrending) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tagWeights);
    allScored.push({
      item: toFeedItem(song, "trending", "Trending"),
      score: 500 + tScore * 0.01 + taff,
    });
  }

  for (const song of newReleases) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tagWeights);
    if (hasHistory && taff > 2) {
      allScored.push({
        item: toFeedItem(song, "recommended", "Recommended for you"),
        score: 800 + taff,
      });
    } else {
      allScored.push({
        item: toFeedItem(song, "new_release", "New Release"),
        score: 100 + taff,
      });
    }
  }

  allScored.sort((a, b) => b.score - a.score);

  return { items: allScored.map((s) => s.item), strategy };
}
