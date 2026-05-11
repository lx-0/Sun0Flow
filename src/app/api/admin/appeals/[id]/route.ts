import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/route-handler";
import { logAdminAction } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/event-bus";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";
import { conflict, notFound, ErrorCode } from "@/lib/api-error";

const resolveAppealBody = z.object({
  action: z.enum(["approve", "reject"]),
  adminNote: z.string().max(1000).optional(),
});

type ResolveAppealBody = z.infer<typeof resolveAppealBody>;

export const PATCH = adminRoute<{ id: string }, ResolveAppealBody>(async (_request, { admin, params, body }) => {
  const appeal = await prisma.appeal.findUnique({
    where: { id: params.id },
    include: {
      song: { select: { id: true, title: true, userId: true } },
      user: { select: { id: true, name: true } },
    },
  });

  if (!appeal) {
    return notFound("Appeal not found");
  }

  if (appeal.status !== "pending") {
    return conflict("Appeal has already been resolved", ErrorCode.ALREADY_RESOLVED);
  }

  const newStatus = body.action === "approve" ? "approved" : "rejected";

  await prisma.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: params.id },
      data: {
        status: newStatus,
        adminNote: body.adminNote?.trim()?.slice(0, 1000) || null,
        resolvedAt: new Date(),
      },
    });

    if (body.action === "approve") {
      await tx.song.update({
        where: { id: appeal.songId },
        data: { isHidden: false },
      });
    }

    const songTitle = appeal.song.title ?? "your song";
    const notifTitle = body.action === "approve" ? "Appeal approved" : "Appeal rejected";
    const notifMessage =
      body.action === "approve"
        ? `Your appeal for "${songTitle}" was approved. The song has been restored.`
        : `Your appeal for "${songTitle}" was rejected.${body.adminNote ? ` Reason: ${body.adminNote.trim()}` : ""}`;

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
    admin.adminId,
    `appeal_${newStatus}`,
    appeal.songId,
    `Appeal ${params.id} for song "${appeal.song.title}" ${newStatus}` +
      (body.adminNote ? ` — note: ${body.adminNote.trim()}` : "")
  );

  return NextResponse.json({ id: params.id, status: newStatus });
}, { route: "/api/admin/appeals/[id]", body: resolveAppealBody });
