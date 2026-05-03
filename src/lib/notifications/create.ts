import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";
import type { NotificationType } from "./types";

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  href?: string | null;
  songId?: string | null;
};

/**
 * Single entry point for all in-app notification creation.
 * Handles: DB insert, unread-count cache invalidation, SSE broadcast.
 */
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

  invalidateByPrefix(cacheKey("notifications-unread", params.userId));

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
