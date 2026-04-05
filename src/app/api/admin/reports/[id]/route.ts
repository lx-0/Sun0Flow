import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const report = await prisma.report.findUnique({
    where: { id },
    include: { song: { select: { id: true, userId: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json();
  const { action, adminNote } = body;

  if (!action || !["dismiss", "hide_song", "delete_song", "warn_user"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: dismiss, hide_song, delete_song, warn_user", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    adminNote: adminNote?.trim()?.slice(0, 1000) || null,
    updatedAt: new Date(),
  };

  if (action === "dismiss") {
    updates.status = "dismissed";
    await logAdminAction(admin!.id, "dismiss_report", report.id, `Dismissed report ${report.id}`);
  } else if (action === "hide_song") {
    if (!report.songId) {
      return NextResponse.json({ error: "This report is not for a song", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    updates.status = "actioned";
    await prisma.song.update({
      where: { id: report.songId },
      data: { isHidden: true, isPublic: false },
    });
    await logAdminAction(admin!.id, "hide_song", report.songId, `Hidden song via report ${report.id}`);
  } else if (action === "delete_song") {
    if (!report.songId) {
      return NextResponse.json({ error: "This report is not for a song", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    updates.status = "actioned";
    await prisma.song.delete({ where: { id: report.songId } });
    await logAdminAction(admin!.id, "delete_song", report.songId, `Deleted song via report ${report.id}`);

    const updated = await prisma.report.update({ where: { id }, data: updates });
    return NextResponse.json(updated);
  } else if (action === "warn_user") {
    if (!report.song) {
      return NextResponse.json({ error: "This report is not for a song", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    updates.status = "actioned";
    logger.info({ userId: report.song.userId, songId: report.songId, reportId: report.id }, "moderation: warning issued to user");
    await logAdminAction(admin!.id, "warn_user", report.song.userId, `Warned user via report ${report.id} for song ${report.songId}`);
  }

  const updated = await prisma.report.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json(updated);
}
