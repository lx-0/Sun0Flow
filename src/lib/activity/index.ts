import { prisma } from "@/lib/prisma";
import { queryPublicActivities, type ActivityFeedResult } from "./query";

export { queryPublicActivities } from "./query";
export type { ActivityFeedItem, ActivityFeedResult } from "./query";

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
