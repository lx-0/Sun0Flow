import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";

/**
 * GET /api/discover
 *
 * Personalized feed for the discover page.
 *
 * For authenticated users:
 *   - Songs from followed users (recent public releases)
 *   - Trending public songs
 *   - New public releases
 *   - Each item is ranked by a taste-affinity score when the user has activity history
 *
 * For anonymous users or users with no history:
 *   - Fallback: trending + new releases
 *
 * Query params:
 *   page   — page number (default 1)
 *   tag    — genre tag filter
 *   mood   — mood tag filter
 */

type FeedReason =
  | "recommended"
  | "followed_artist"
  | "trending"
  | "new_release";

interface FeedItem {
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

const PAGE_SIZE = 20;
// How many songs to pull per bucket before merging
const BUCKET_SIZE = 60;

const songPublicSelect = {
  id: true,
  userId: true,
  title: true,
  tags: true,
  imageUrl: true,
  audioUrl: true,
  duration: true,
  rating: true,
  playCount: true,
  downloadCount: true,
  publicSlug: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} satisfies Prisma.SongSelect;

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

function baseWhere(tag: string, mood: string): Prisma.SongWhereInput {
  const base: Prisma.SongWhereInput = {
    isPublic: true,
    isHidden: false,
    archivedAt: null,
    generationStatus: "ready",
  };
  if (tag && mood) {
    base.AND = [
      { tags: { contains: tag, mode: "insensitive" } },
      { tags: { contains: mood, mode: "insensitive" } },
    ];
  } else if (tag) {
    base.tags = { contains: tag, mode: "insensitive" };
  } else if (mood) {
    base.tags = { contains: mood, mode: "insensitive" };
  }
  return base;
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

/** Extract a set of lowercase tag tokens from a tags string */
function parseTags(tags: string | null): Set<string> {
  if (!tags) return new Set();
  return new Set(
    tags
      .split(/[,;\s]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Compute simple tag-overlap affinity score */
function affinityScore(songTags: Set<string>, preferredTags: Map<string, number>): number {
  if (preferredTags.size === 0 || songTags.size === 0) return 0;
  let score = 0;
  songTags.forEach((tag) => {
    score += preferredTags.get(tag) ?? 0;
  });
  return score;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const pageParam = parseInt(params.get("page") || "1", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;

    const tag = params.get("tag")?.trim() || "";
    const mood = params.get("mood")?.trim() || "";

    // Optional auth — personalization only for logged-in users
    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      // Anonymous: trending + new release fallback (shared cache)
      const data = await getAnonymousFeed(tag, mood, page);
      return NextResponse.json(data, {
        headers: { "Cache-Control": CacheControl.publicShort },
      });
    }

    // Authenticated — build personalized feed (cached per user + filters + hour bucket)
    const hourBucket = Math.floor(Date.now() / (1000 * 60 * 5)); // refresh every 5 min
    const key = cacheKey(
      "discover-feed-v1",
      userId,
      tag || "any",
      mood || "any",
      String(hourBucket)
    );

    const { items, strategy } = await cached(
      key,
      () => buildPersonalizedFeed(userId, tag, mood),
      CacheTTL.DISCOVER
    );

    const total = items.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);

    return NextResponse.json(
      {
        feed: pageItems,
        pagination: {
          page,
          totalPages,
          total,
          hasMore: page < totalPages,
        },
        strategy,
      },
      { headers: { "Cache-Control": CacheControl.privateShort } }
    );
  } catch (error) {
    logServerError("discover-feed", error, { route: "/api/discover" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

async function getAnonymousFeed(
  tag: string,
  mood: string,
  page: number
): Promise<{
  feed: FeedItem[];
  pagination: { page: number; totalPages: number; total: number; hasMore: boolean };
  strategy: string;
}> {
  const key = cacheKey("discover-anon-v1", tag || "any", mood || "any");
  const items = await cached(
    key,
    async () => {
      const where = baseWhere(tag, mood);
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

      // Score trending pool
      const scoredTrending = trendingPool
        .map((s) => ({
          ...s,
          _score: trendingScore(s.playCount, s.downloadCount, s.createdAt),
        }))
        .sort((a, b) => b._score - a._score);

      // Merge: interleave trending + new, deduplicate
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
    },
    CacheTTL.DISCOVER
  );

  const total = items.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const start = (page - 1) * PAGE_SIZE;
  return {
    feed: items.slice(start, start + PAGE_SIZE),
    pagination: { page, totalPages, total, hasMore: page < totalPages },
    strategy: "trending_fallback",
  };
}

async function buildPersonalizedFeed(
  userId: string,
  tag: string,
  mood: string
): Promise<{ items: FeedItem[]; strategy: string }> {
  const where = baseWhere(tag, mood);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1. Get the IDs of users this user follows
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true, following: { select: { name: true, username: true } } },
  });
  const followedIds = follows.map((f) => f.followingId);

  // Map followedId → display name for reason labels
  const followedNames = new Map<string, string>(
    follows.map((f) => [
      f.followingId,
      f.following.name || f.following.username || "someone you follow",
    ])
  );

  // 2. Build taste profile from user's signals (favorites + high-rated + recently played)
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

  // Build weighted tag preference map
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
  const strategy = hasHistory ? "personalized" : "trending_fallback";

  // 3. Fetch three buckets in parallel
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

  // 4. Assign reasons and scores
  interface ScoredItem {
    item: FeedItem;
    score: number;
  }

  const seen = new Set<string>();
  const allScored: ScoredItem[] = [];

  // Followed artists get highest base score
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

  // Trending songs
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

  // New releases
  for (const song of newReleases) {
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    const taff = affinityScore(parseTags(song.tags), tagWeights);
    // Boost items that match taste signals to "Recommended for you"
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

  // 5. Sort by score descending
  allScored.sort((a, b) => b.score - a.score);

  return { items: allScored.map((s) => s.item), strategy };
}
