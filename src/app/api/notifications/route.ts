import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { CacheControl, cached, invalidateByPrefix, cacheKey } from "@/lib/cache";
import { badRequest } from "@/lib/api-error";

export const GET = authRoute(async (request, { auth }) => {
  const searchParams = request.nextUrl.searchParams;
  const limitParam = parseInt(searchParams.get("limit") || "", 10);
  const limit =
    !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100
      ? limitParam
      : 20;
  const cursor = searchParams.get("cursor") || "";

  const notifications = await prisma.notification.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > limit;
  const sliced = hasMore ? notifications.slice(0, limit) : notifications;
  const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

  const unreadCount = await cached(
    cacheKey("notifications-unread", auth.userId),
    () => prisma.notification.count({ where: { userId: auth.userId, read: false } }),
    10_000
  );

  return NextResponse.json({ notifications: sliced, nextCursor, unreadCount }, {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/notifications" });

const VALID_TYPES = [
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
];

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const { type, title, message, href, songId } = body;

  if (!type || !title || !message || !VALID_TYPES.includes(type)) {
    return badRequest("Invalid input");
  }

  const notification = await prisma.notification.create({
    data: {
      userId: auth.userId,
      type,
      title,
      message,
      href: href || null,
      songId: songId || null,
    },
  });

  invalidateByPrefix(cacheKey("notifications-unread", auth.userId));

  broadcast(auth.userId, {
    type: "notification",
    data: { id: notification.id, type, title, message, href: href || null, songId: songId || null },
  });

  return NextResponse.json({ notification }, { status: 201 });
}, { route: "/api/notifications" });
