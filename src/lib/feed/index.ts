import { prisma } from "@/lib/prisma";
import { SongFilters, SongSelect } from "@/lib/songs";
import { buildTasteProfile } from "./taste-profile";
import { rankAnonymousFeed, rankPersonalizedFeed } from "./rank";

export type { FeedReason, FeedItem, SongRow } from "./rank";
export type { TasteProfile } from "./taste-profile";

export interface FeedFilters {
  tag?: string;
  mood?: string;
}

export interface FeedResult {
  items: import("./rank").FeedItem[];
  strategy: "personalized" | "trending_fallback";
}

const PAGE_SIZE = 20;
const BUCKET_SIZE = 60;

const songPublicSelect = SongSelect.public;

function baseWhere(filters: FeedFilters) {
  let where = SongFilters.publicDiscovery();
  const tags = [filters.tag, filters.mood].filter(Boolean) as string[];
  where = SongFilters.withTagContains(where, tags);
  return where;
}

export function paginate(items: import("./rank").FeedItem[], page: number) {
  const total = items.length;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  const start = (page - 1) * PAGE_SIZE;
  return {
    feed: items.slice(start, start + PAGE_SIZE),
    pagination: { page, totalPages, total, hasMore: page < totalPages },
  };
}

export async function buildAnonymousFeed(
  filters: FeedFilters,
): Promise<import("./rank").FeedItem[]> {
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

  return rankAnonymousFeed(trendingPool, newReleases);
}

export async function buildPersonalizedFeed(
  userId: string,
  filters: FeedFilters,
): Promise<FeedResult> {
  const where = baseWhere(filters);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [follows, tasteProfile] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: {
        followingId: true,
        following: { select: { name: true, username: true } },
      },
    }),
    buildTasteProfile(userId),
  ]);

  const followedIds = follows.map((f) => f.followingId);
  const followedNames = new Map<string, string>(
    follows.map((f) => [
      f.followingId,
      f.following.name || f.following.username || "someone you follow",
    ]),
  );

  const strategy =
    tasteProfile.size > 0 ? "personalized" : ("trending_fallback" as const);

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

  const items = rankPersonalizedFeed({
    followedSongs,
    trendingPool,
    newReleases,
    followedNames,
    tasteProfile,
  });

  return { items, strategy };
}
