import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";

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

  // When a new public song is created, notify all followers
  if (params.type === "song_created" && params.songId) {
    notifyFollowersOfNewSong(params.userId, params.songId).catch(() => {
      // Non-fatal
    });
  }
}

async function notifyFollowersOfNewSong(creatorId: string, songId: string) {
  const [song, creator, followers] = await Promise.all([
    prisma.song.findUnique({
      where: { id: songId },
      select: { title: true, publicSlug: true, isPublic: true, isHidden: true, archivedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: creatorId },
      select: { name: true, username: true },
    }),
    prisma.follow.findMany({
      where: { followingId: creatorId },
      select: { followerId: true },
    }),
  ]);

  if (!song || !song.isPublic || song.isHidden || song.archivedAt) return;
  if (followers.length === 0) return;

  const creatorName = creator?.name ?? creator?.username ?? "Someone";
  const songTitle = song.title ?? "Untitled";
  const href = song.publicSlug ? `/s/${song.publicSlug}` : null;

  await Promise.allSettled(
    followers.map(async ({ followerId }) => {
      const notification = await prisma.notification.create({
        data: {
          userId: followerId,
          type: "new_song_from_following",
          title: "New song from someone you follow",
          message: `${creatorName} published "${songTitle}"`,
          href: href ?? null,
          songId,
        },
      });
      invalidateByPrefix(cacheKey("notifications-unread", followerId));
      broadcast(followerId, {
        type: "notification",
        data: { id: notification.id, type: "new_song_from_following" },
      });
    })
  );
}
