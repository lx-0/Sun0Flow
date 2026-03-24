import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";

// PATCH /api/notifications/read-all — mark all notifications as read
export async function PATCH(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    await prisma.notification.updateMany({
      where: { userId: userId, read: false },
      data: { read: true },
    });

    invalidateByPrefix(cacheKey("notifications-unread", userId));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
