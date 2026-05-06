import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";
import { sendPushToUser } from "@/lib/push";
import { sendGenerationCompleteEmail } from "@/lib/email";
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

const EMAIL_PREF_FIELD: Partial<Record<NotificationType, "emailGenerationComplete">> = {
  generation_complete: "emailGenerationComplete",
};

export type NotifyUserParams = CreateNotificationParams & {
  push?: { tag?: string } | false;
  email?: false;
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
 * Persist notification + broadcast SSE + send push + send email
 * (each channel gated by the user's preference).
 */
export async function notifyUser(params: NotifyUserParams) {
  const notification = await createNotification(params);

  const pushPref = PUSH_PREF_FIELD[params.type];
  const emailPref = EMAIL_PREF_FIELD[params.type];
  const needsPrefs = (params.push !== false && pushPref) || (params.email !== false && emailPref);

  let userPrefs: Record<string, unknown> | null = null;
  if (needsPrefs) {
    try {
      const selectFields: Record<string, boolean> = {};
      if (pushPref) selectFields[pushPref] = true;
      if (emailPref) {
        selectFields[emailPref] = true;
        selectFields.email = true;
        selectFields.unsubscribeToken = true;
      }
      userPrefs = await prisma.user.findUnique({
        where: { id: params.userId },
        select: selectFields,
      }) as Record<string, unknown> | null;
    } catch (err) {
      logger.error({ err, userId: params.userId }, "notifyUser: failed to fetch user preferences");
    }
  }

  if (params.push !== false && pushPref) {
    const shouldPush = userPrefs?.[pushPref] !== false;
    if (shouldPush) {
      sendPushToUser(params.userId, {
        title: params.title,
        body: params.message,
        url: params.href ?? "/",
        tag: typeof params.push === "object" ? params.push.tag : undefined,
      }).catch(() => {});
    }
  }

  if (params.email !== false && emailPref && userPrefs?.email) {
    const shouldEmail = userPrefs[emailPref] !== false;
    if (shouldEmail) {
      const email = userPrefs.email as string;
      let unsubToken = userPrefs.unsubscribeToken as string | null;
      if (!unsubToken) {
        unsubToken = crypto.randomUUID();
        await prisma.user.update({ where: { id: params.userId }, data: { unsubscribeToken: unsubToken } }).catch(() => {});
      }
      sendNotificationEmail(params, email, unsubToken).catch((err) =>
        logger.error({ userId: params.userId, type: params.type, err }, "notifyUser: email send failed")
      );
    }
  }

  return notification;
}

async function sendNotificationEmail(
  params: CreateNotificationParams,
  email: string,
  unsubscribeToken: string,
): Promise<void> {
  switch (params.type) {
    case "generation_complete":
      await sendGenerationCompleteEmail(
        email,
        { id: params.songId!, title: params.title },
        unsubscribeToken,
      );
      break;
  }
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
