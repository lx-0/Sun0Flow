import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const { error, user: admin } = await requireAdmin();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const reportIds: string[] = Array.isArray(body?.reportIds) ? body.reportIds.slice(0, 100) : [];
  const action: string = typeof body?.action === "string" ? body.action : "";

  if (reportIds.length === 0) {
    return NextResponse.json({ error: "reportIds must be a non-empty array", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  if (!["dismiss", "hide_song", "delete_song", "warn_user"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: dismiss, hide_song, delete_song, warn_user", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const reports = await prisma.report.findMany({
    where: { id: { in: reportIds }, status: "pending" },
    include: { song: { select: { id: true, userId: true } } },
  });

  const processed: string[] = [];
  const errors: string[] = [];

  for (const report of reports) {
    try {
      const newStatus = action === "dismiss" ? "dismissed" : "actioned";
      const updates: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };

      if (action === "hide_song") {
        if (!report.songId) { errors.push(report.id); continue; }
        await prisma.song.update({
          where: { id: report.songId },
          data: { isHidden: true, isPublic: false },
        });
        await logAdminAction(admin!.id, "hide_song", report.songId, `Bulk hide via report ${report.id}`);
      } else if (action === "delete_song") {
        if (!report.songId) { errors.push(report.id); continue; }
        await prisma.song.delete({ where: { id: report.songId } });
        await logAdminAction(admin!.id, "delete_song", report.songId, `Bulk delete via report ${report.id}`);
        await prisma.report.update({ where: { id: report.id }, data: updates });
        processed.push(report.id);
        continue;
      } else if (action === "warn_user") {
        if (!report.song) { errors.push(report.id); continue; }
        logger.info({ userId: report.song.userId, songId: report.songId, reportId: report.id }, "moderation: bulk warning issued");
        await logAdminAction(admin!.id, "warn_user", report.song.userId, `Bulk warn via report ${report.id}`);
      } else if (action === "dismiss") {
        await logAdminAction(admin!.id, "dismiss_report", report.id, `Bulk dismiss report`);
      }

      await prisma.report.update({ where: { id: report.id }, data: updates });
      processed.push(report.id);
    } catch (err) {
      errors.push(report.id);
      logger.error({ reportId: report.id, err }, "bulk moderation action failed");
    }
  }

  return NextResponse.json({ processed: processed.length, errors: errors.length, processedIds: processed });
}
