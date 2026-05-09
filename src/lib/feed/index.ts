import { prisma } from "@/lib/prisma";
import { SongFilters, SongSelect } from "@/lib/songs";
import { gatherUserSignals } from "@/lib/user-signals";
import { rankAnonymousFeed, rankPersonalizedFeed, type TasteProfile } from "./rank";

export type { FeedReason, FeedItem, SongRow, TasteProfile } from "./rank";

export interface FeedFilters {
  tag?: string;
  mood?: string;
}

export interface FeedResult {
  items: import("./rank").FeedItem[];
  strategy: "personalized" | "trending_fallback";
}

export interface ActivityFeedItem {
  id: string;
  type: string;
  createdAt: Date;
  user: { id: string; name: string | null; image: string | null };
  song: {
    id: string;
    publicSlug: string | null;
    title: string | null;
    imageUrl: string | null;
    duration: number | null;
    tags: string | null;
  } | null;
  playlist: {
    id: string;
    name: string;
    slug: string | null;
    songCount: number;
  } | null;
}

export interface ActivityFeedResult {
  items: ActivityFeedItem[];
  pagination: { page: number; totalPages: number; total: number; hasMore: boolean };
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

async function buildTasteProfile(userId: string): Promise<TasteProfile> {
  const signals = await gatherUserSignals(userId);
  return signals.tagWeights;
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

export async function buildActivityFeed(
  userId: string,
  page: number,
): Promise<ActivityFeedResult> {
  const skip = (page - 1) * PAGE_SIZE;

  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  if (following.length === 0) {
    return {
      items: [],
      pagination: { page, totalPages: 0, total: 0, hasMore: false },
    };
  }

  const followingIds = following.map((f) => f.followingId);

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where: { userId: { in: followingIds } },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        createdAt: true,
        user: { select: { id: true, name: true, image: true } },
        song: {
          select: {
            id: true,
            publicSlug: true,
            title: true,
            imageUrl: true,
            duration: true,
            tags: true,
            isPublic: true,
            isHidden: true,
            archivedAt: true,
            generationStatus: true,
          },
        },
        playlist: {
          select: {
            id: true,
            name: true,
            slug: true,
            isPublic: true,
            _count: { select: { songs: true } },
          },
        },
      },
    }),
    prisma.activity.count({
      where: { userId: { in: followingIds } },
    }),
  ]);

  const items: ActivityFeedItem[] = activities
    .filter((a) => {
      if (a.type === "song_created" || a.type === "song_favorited") {
        return (
          a.song &&
          a.song.isPublic &&
          !a.song.isHidden &&
          !a.song.archivedAt &&
          a.song.generationStatus === "ready"
        );
      }
      if (a.type === "playlist_created") {
        return a.playlist && a.playlist.isPublic;
      }
      return false;
    })
    .map((a) => ({
      id: a.id,
      type: a.type,
      createdAt: a.createdAt,
      user: a.user,
      song: a.song
        ? {
            id: a.song.id,
            publicSlug: a.song.publicSlug,
            title: a.song.title,
            imageUrl: a.song.imageUrl,
            duration: a.song.duration,
            tags: a.song.tags,
          }
        : null,
      playlist: a.playlist
        ? {
            id: a.playlist.id,
            name: a.playlist.name,
            slug: a.playlist.slug,
            songCount: a.playlist._count.songs,
          }
        : null,
    }));

  return {
    items,
    pagination: {
      page,
      totalPages: Math.ceil(total / PAGE_SIZE),
      total,
      hasMore: skip + PAGE_SIZE < total,
    },
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
