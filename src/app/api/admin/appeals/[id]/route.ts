import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const { action, adminNote } = body;

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const appeal = await prisma.appeal.findUnique({
    where: { id },
    include: {
      song: { select: { id: true, title: true, userId: true } },
      user: { select: { id: true, name: true } },
    },
  });

  if (!appeal) {
    return NextResponse.json({ error: "Appeal not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (appeal.status !== "pending") {
    return NextResponse.json(
      { error: "Appeal has already been resolved", code: "ALREADY_RESOLVED" },
      { status: 409 }
    );
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id },
      data: {
        status: newStatus,
        adminNote: adminNote?.trim()?.slice(0, 1000) || null,
        resolvedAt: new Date(),
      },
    });

    if (action === "approve") {
      await tx.song.update({
        where: { id: appeal.songId },
        data: { isHidden: false },
      });
    }

    const songTitle = appeal.song.title ?? "your song";
    const notifTitle = action === "approve" ? "Appeal approved" : "Appeal rejected";
    const notifMessage =
      action === "approve"
        ? `Your appeal for "${songTitle}" was approved. The song has been restored.`
        : `Your appeal for "${songTitle}" was rejected.${adminNote ? ` Reason: ${adminNote.trim()}` : ""}`;

    const notification = await tx.notification.create({
      data: {
        userId: appeal.userId,
        type: "announcement",
        title: notifTitle,
        message: notifMessage,
        songId: appeal.songId,
        href: `/library/${appeal.songId}`,
      },
    });

    invalidateByPrefix(cacheKey("notifications-unread", appeal.userId));
    broadcast(appeal.userId, {
      type: "notification",
      data: {
        id: notification.id,
        type: "announcement",
        title: notifTitle,
        message: notifMessage,
        songId: appeal.songId,
        href: `/library/${appeal.songId}`,
      },
    });
  });

  await logAdminAction(
    admin!.id,
    `appeal_${newStatus}`,
    appeal.songId,
    `Appeal ${id} for song "${appeal.song.title}" ${newStatus}` +
      (adminNote ? ` — note: ${adminNote.trim()}` : "")
  );

  return NextResponse.json({ id, status: newStatus });
}
