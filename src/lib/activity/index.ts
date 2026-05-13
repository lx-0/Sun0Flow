import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";

export interface ActivityFeedItem {
  id: string;
  type: string;
  createdAt: Date;
  user: { id: string; name: string | null; image: string | null } | null;
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

const activitySelect = {
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
      _count: {
        select: { songs: { where: { song: { archivedAt: null } } } },
      },
    },
  },
} as const;

type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof activitySelect }>;

function isVisibleActivity(a: ActivityRow): boolean {
  if (a.type === "song_created" || a.type === "song_favorited") {
    return (
      !!a.song &&
      a.song.isPublic &&
      !a.song.isHidden &&
      !a.song.archivedAt &&
      a.song.generationStatus === "ready"
    );
  }
  if (a.type === "playlist_created") {
    return !!a.playlist && a.playlist.isPublic;
  }
  return false;
}

function mapActivityRow(a: ActivityRow): ActivityFeedItem {
  return {
    id: a.id,
    type: a.type,
    createdAt: a.createdAt,
    user: a.user ?? null,
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
  };
}

export async function queryPublicActivities(
  userIds: string[],
  page: number,
): Promise<ActivityFeedResult> {
  if (userIds.length === 0) {
    return { items: [], pagination: offsetPagination(page, DEFAULT_PAGE_SIZE, 0) };
  }

  const skip = pageSkip(page, DEFAULT_PAGE_SIZE);
  const where = { userId: { in: userIds } };

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: DEFAULT_PAGE_SIZE,
      select: activitySelect,
    }),
    prisma.activity.count({ where }),
  ]);

  const items = activities.filter(isVisibleActivity).map(mapActivityRow);

  return { items, pagination: offsetPagination(page, DEFAULT_PAGE_SIZE, total) };
}

export async function recordActivity(params: {
  userId: string;
  type: "song_created" | "playlist_created" | "song_favorited" | "song_added_to_playlist" | "song_removed_from_playlist";
  songId?: string;
  playlistId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.activity.create({
      data: {
        userId: params.userId,
        type: params.type,
        songId: params.songId ?? null,
        playlistId: params.playlistId ?? null,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    });
  } catch {
    // Non-fatal — activity recording failure should not break the main flow
  }
}

export async function buildActivityFeed(
  userId: string,
  page: number,
): Promise<ActivityFeedResult> {
  const following = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });

  const followingIds = following.map((f) => f.followingId);
  return queryPublicActivities(followingIds, page);
}
