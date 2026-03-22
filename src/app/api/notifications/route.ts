import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { broadcast } from "@/lib/event-bus";

// GET /api/notifications — list notifications for current user
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit =
      !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100
        ? limitParam
        : 20;
    const cursor = params.get("cursor") || "";

    const notifications = await prisma.notification.findMany({
      where: { userId: userId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = notifications.length > limit;
    const sliced = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    const unreadCount = await prisma.notification.count({
      where: { userId: userId, read: false },
    });

    return NextResponse.json({ notifications: sliced, nextCursor, unreadCount });
  } catch (error) {
    logServerError("notifications-list", error, { route: "/api/notifications" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

const VALID_TYPES = [
  "generation_complete",
  "generation_failed",
  "rate_limit_reset",
  "announcement",
];

// POST /api/notifications — create a notification for current user
export async function POST(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const body = await request.json();
    const { type, title, message, href, songId } = body;

    if (!type || !title || !message || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const notification = await prisma.notification.create({
      data: {
        userId: userId,
        type,
        title,
        message,
        href: href || null,
        songId: songId || null,
      },
    });

    broadcast(userId, {
      type: "notification",
      data: { id: notification.id, type, title, message, href: href || null, songId: songId || null },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
