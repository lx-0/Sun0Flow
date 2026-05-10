import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { CacheControl, cached, cacheKey } from "@/lib/cache";
import { badRequest } from "@/lib/api-error";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import type { NotificationType } from "@/lib/notifications";
import { zLimitParam, zCursorParam } from "@/lib/query-params";
import { cursorPaginate } from "@/lib/pagination";

const notificationsQuery = z.object({
  limit: zLimitParam(20, 100),
  cursor: zCursorParam,
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const { items, nextCursor } = cursorPaginate(notifications, query.limit);

    const unreadCount = await cached(
      cacheKey("notifications-unread", auth.userId),
      () =>
        prisma.notification.count({
          where: { userId: auth.userId, read: false },
        }),
      10_000,
    );

    return NextResponse.json(
      { notifications: items, nextCursor, unreadCount },
      { headers: { "Cache-Control": CacheControl.privateNoCache } },
    );
  },
  { route: "/api/notifications", query: notificationsQuery },
);

export const POST = authRoute(
  async (request, { auth }) => {
    const body = await request.json();
    const { type, title, message, href, songId } = body;

    if (
      !type ||
      !title ||
      !message ||
      !(NOTIFICATION_TYPES as readonly string[]).includes(type)
    ) {
      return badRequest("Invalid input");
    }

    const notification = await createNotification({
      userId: auth.userId,
      type: type as NotificationType,
      title,
      message,
      href: href || null,
      songId: songId || null,
    });

    return NextResponse.json({ notification }, { status: 201 });
  },
  { route: "/api/notifications" },
);
