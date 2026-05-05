import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";
import { sendPushToUser } from "@/lib/push";
import { logger } from "@/lib/logger";

export const NOTIFICATION_TYPES = [
  "generation_complete",
  "generation_failed",
  "import_complete",
  "error",
  "rate_limit_reset",
  "announcement",
  "credit_update",
  "payment_failed",
  "song_comment",
  "new_follower",
  "new_song_from_following",
  "playlist_invite",
  "milestone_earned",
  "low_credits",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  songId?: string | null;
};

const PUSH_PREF_FIELD: Partial<
  Record<NotificationType, "pushGenerationComplete" | "pushNewFollower" | "pushSongComment">
> = {
  generation_complete: "pushGenerationComplete",
  new_follower: "pushNewFollower",
  song_comment: "pushSongComment",
};

export type NotifyUserParams = CreateNotificationParams & {
  push?: { tag?: string } | false;
};

function invalidateUnreadCache(userId: string) {
  invalidateByPrefix(cacheKey("notifications-unread", userId));
}

export async function createNotification(params: CreateNotificationParams) {
  const notification = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      href: params.href ?? null,
      songId: params.songId ?? null,
    },
  });

  invalidateUnreadCache(params.userId);

  broadcast(params.userId, {
    type: "notification",
    data: {
      id: notification.id,
      type: params.type,
      title: params.title,
      message: params.message,
      href: params.href ?? null,
      songId: params.songId ?? null,
    },
  });

  return notification;
}

/**
 * Persist notification + broadcast SSE + send push (when the user's preference allows it).
 */
export async function notifyUser(params: NotifyUserParams) {
  const notification = await createNotification(params);

  if (params.push !== false) {
    const prefField = PUSH_PREF_FIELD[params.type];
    let shouldPush = !!prefField;

    if (prefField) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: params.userId },
          select: { [prefField]: true },
        });
        shouldPush = (user as Record<string, unknown> | null)?.[prefField] !== false;
      } catch (err) {
        logger.error({ err, userId: params.userId }, "notifyUser: failed to check push preference");
        shouldPush = true;
      }
    }

    if (shouldPush) {
      sendPushToUser(params.userId, {
        title: params.title,
        body: params.message,
        url: params.href ?? "/",
        tag: typeof params.push === "object" ? params.push.tag : undefined,
      }).catch(() => {});
    }
  }

  return notification;
}

export async function markRead(
  userId: string,
  notificationId: string
): Promise<{ ok: boolean; notFound?: boolean }> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) {
    return { ok: false, notFound: true };
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });

  invalidateUnreadCache(userId);
  return { ok: true };
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  invalidateUnreadCache(userId);
}

export async function notifyFollowersOfNewSong(creatorId: string, songId: string): Promise<void> {
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
    followers.map(({ followerId }) =>
      createNotification({
        userId: followerId,
        type: "new_song_from_following",
        title: "New song from someone you follow",
        message: `${creatorName} published "${songTitle}"`,
        href: href ?? null,
        songId,
      })
    )
  );
}
