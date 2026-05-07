import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/lib/auth";

// ── Types ───────────────────────────────────────────────────────────

const VALID_REASONS = ["offensive", "copyright", "spam", "other"] as const;
export type ReportReason = (typeof VALID_REASONS)[number];

const VALID_ACTIONS = ["dismiss", "hide_song", "delete_song", "warn_user"] as const;
export type ModerationAction = (typeof VALID_ACTIONS)[number];

export { VALID_REASONS, VALID_ACTIONS };

export type CreateReportInput = {
  songId?: string;
  playlistId?: string;
  reason: ReportReason;
  description?: string;
};

export type ResolveActionInput = {
  reportId: string;
  adminId: string;
  action: ModerationAction;
  adminNote?: string;
};

export type BulkActionInput = {
  reportIds: string[];
  adminId: string;
  action: ModerationAction;
};

export type BulkActionResult = {
  processed: number;
  errors: number;
  processedIds: string[];
};

export type ListReportsInput = {
  status: string;
  page: number;
};

// ── Report creation ─────────────────────────────────────────────────

export async function createReport(userId: string, input: CreateReportInput) {
  if (input.songId) {
    const song = await prisma.song.findUnique({
      where: { id: input.songId },
      select: { id: true, userId: true },
    });
    if (!song) return { error: "NOT_FOUND", message: "Song not found" } as const;
    if (song.userId === userId) return { error: "SELF_REPORT", message: "Cannot report your own song" } as const;

    const existing = await prisma.report.findFirst({
      where: { songId: input.songId, reporterId: userId },
      select: { id: true },
    });
    if (existing) return { error: "DUPLICATE", message: "You have already reported this song" } as const;
  } else {
    const playlist = await prisma.playlist.findUnique({
      where: { id: input.playlistId },
      select: { id: true, userId: true },
    });
    if (!playlist) return { error: "NOT_FOUND", message: "Playlist not found" } as const;
    if (playlist.userId === userId) return { error: "SELF_REPORT", message: "Cannot report your own playlist" } as const;

    const existing = await prisma.report.findFirst({
      where: { playlistId: input.playlistId, reporterId: userId },
      select: { id: true },
    });
    if (existing) return { error: "DUPLICATE", message: "You have already reported this playlist" } as const;
  }

  const report = await prisma.report.create({
    data: {
      songId: input.songId || null,
      playlistId: input.playlistId || null,
      reporterId: userId,
      reason: input.reason,
      description: input.description?.trim() || null,
    },
  });

  logger.info(
    { reportId: report.id, songId: input.songId, playlistId: input.playlistId, userId, reason: input.reason },
    "moderation: new report filed"
  );

  return { data: { id: report.id, status: "pending" } } as const;
}

// ── Report listing ──────────────────────────────────────────────────

const PAGE_SIZE = 20;

export async function listReports({ status, page }: ListReportsInput) {
  const skip = (page - 1) * PAGE_SIZE;
  const where = status === "all" ? {} : { status };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        song: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            audioUrl: true,
            isHidden: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        reporter: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return { reports, total, page, totalPages: Math.ceil(total / PAGE_SIZE) };
}

export async function pendingReportCount() {
  return prisma.report.count({ where: { status: "pending" } });
}

// ── Single report action ────────────────────────────────────────────

export async function resolveReport({ reportId, adminId, action, adminNote }: ResolveActionInput) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { song: { select: { id: true, userId: true } } },
  });

  if (!report) return { error: "NOT_FOUND", message: "Report not found" } as const;

  const updates: Record<string, unknown> = {
    adminNote: adminNote?.trim()?.slice(0, 1000) || null,
    updatedAt: new Date(),
  };

  if (action === "dismiss") {
    updates.status = "dismissed";
    await logAdminAction(adminId, "dismiss_report", report.id, `Dismissed report ${report.id}`);
  } else if (action === "hide_song") {
    if (!report.songId || !report.song) {
      return { error: "INVALID_TARGET", message: "This report is not for a song" } as const;
    }
    updates.status = "actioned";
    await prisma.song.update({
      where: { id: report.songId },
      data: { isHidden: true, isPublic: false },
    });
    await logAdminAction(adminId, "hide_song", report.songId, `Hidden song via report ${report.id}`);
  } else if (action === "delete_song") {
    if (!report.songId) {
      return { error: "INVALID_TARGET", message: "This report is not for a song" } as const;
    }
    updates.status = "actioned";
    await prisma.song.delete({ where: { id: report.songId } });
    await logAdminAction(adminId, "delete_song", report.songId, `Deleted song via report ${report.id}`);

    const updated = await prisma.report.update({ where: { id: reportId }, data: updates });
    return { data: updated } as const;
  } else if (action === "warn_user") {
    if (!report.song) {
      return { error: "INVALID_TARGET", message: "This report is not for a song" } as const;
    }
    updates.status = "actioned";
    logger.info(
      { userId: report.song.userId, songId: report.songId, reportId: report.id },
      "moderation: warning issued to user"
    );
    await logAdminAction(adminId, "warn_user", report.song.userId, `Warned user via report ${report.id} for song ${report.songId}`);
  }

  const updated = await prisma.report.update({ where: { id: reportId }, data: updates });
  return { data: updated } as const;
}

// ── Bulk report action ──────────────────────────────────────────────

export async function bulkResolveReports({ reportIds, adminId, action }: BulkActionInput): Promise<BulkActionResult> {
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
        if (!report.songId || !report.song) { errors.push(report.id); continue; }
        await prisma.song.update({
          where: { id: report.songId },
          data: { isHidden: true, isPublic: false },
        });
        await logAdminAction(adminId, "hide_song", report.songId, `Bulk hide via report ${report.id}`);
      } else if (action === "delete_song") {
        if (!report.songId) { errors.push(report.id); continue; }
        await prisma.song.delete({ where: { id: report.songId } });
        await logAdminAction(adminId, "delete_song", report.songId, `Bulk delete via report ${report.id}`);
        await prisma.report.update({ where: { id: report.id }, data: updates });
        processed.push(report.id);
        continue;
      } else if (action === "warn_user") {
        if (!report.song) { errors.push(report.id); continue; }
        logger.info(
          { userId: report.song.userId, songId: report.songId, reportId: report.id },
          "moderation: bulk warning issued"
        );
        await logAdminAction(adminId, "warn_user", report.song.userId, `Bulk warn via report ${report.id}`);
      } else if (action === "dismiss") {
        await logAdminAction(adminId, "dismiss_report", report.id, "Bulk dismiss report");
      }

      await prisma.report.update({ where: { id: report.id }, data: updates });
      processed.push(report.id);
    } catch (err) {
      errors.push(report.id);
      logger.error({ reportId: report.id, err }, "bulk moderation action failed");
    }
  }

  return { processed: processed.length, errors: errors.length, processedIds: processed };
}
