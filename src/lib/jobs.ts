/**
 * Job definitions for the background scheduler.
 *
 * Each job is a thin wrapper that calls library functions already in use by
 * the existing /api/cron/* HTTP endpoints.
 *
 * Schedules (all UTC):
 *   - smart-playlist-refresh  — daily at 03:00
 *   - email-digest-send       — weekly Monday at 08:00
 *   - analytics-aggregation   — every hour
 *   - session-cleanup         — daily at 02:00
 */

import { registerJob } from "@/lib/scheduler";
import { refreshStalePlaylists } from "@/lib/smart-playlists";
import { prisma } from "@/lib/prisma";
import { sendWeeklyHighlightsEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Job: smart playlist refresh — daily 03:00 UTC
// ---------------------------------------------------------------------------

async function smartPlaylistRefresh() {
  const { refreshed, skipped } = await refreshStalePlaylists();
  logger.info({ refreshed, skipped }, "jobs: smart-playlist-refresh done");
}

// ---------------------------------------------------------------------------
// Job: email digest send — weekly Monday 08:00 UTC
// ---------------------------------------------------------------------------

async function emailDigestSend() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      emailWeeklyHighlights: true,
      email: { not: null },
      isDisabled: false,
    },
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      _count: { select: { songs: true } },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;
    try {
      const [topSongs, weekGenerations] = await Promise.all([
        prisma.song.findMany({
          where: { userId: user.id, generationStatus: "ready" },
          orderBy: { playCount: "desc" },
          take: 5,
          select: { id: true, title: true, playCount: true },
        }),
        prisma.song.count({
          where: { userId: user.id, createdAt: { gte: oneWeekAgo } },
        }),
      ]);

      await sendWeeklyHighlightsEmail(
        user.email,
        { topSongs, totalSongs: user._count.songs, weekGenerations },
        user.unsubscribeToken ?? user.id
      );
      sent++;
    } catch (err) {
      failed++;
      logger.error({ userId: user.id, err }, "jobs: email-digest-send user failed");
    }
  }

  logger.info({ sent, failed, total: users.length }, "jobs: email-digest-send done");
}

// ---------------------------------------------------------------------------
// Job: analytics aggregation — hourly
// ---------------------------------------------------------------------------

async function analyticsAggregation() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [totalUsers, totalSongs, generationsLastHour, activeUsersToday] =
    await Promise.all([
      prisma.user.count({ where: { isDisabled: false } }),
      prisma.song.count({ where: { generationStatus: "ready" } }),
      prisma.song.count({ where: { createdAt: { gte: oneHourAgo } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: oneDayAgo } } }),
    ]);

  logger.info(
    { totalUsers, totalSongs, generationsLastHour, activeUsersToday },
    "jobs: analytics-aggregation snapshot"
  );
}

// ---------------------------------------------------------------------------
// Job: expired session cleanup — daily 02:00 UTC
// ---------------------------------------------------------------------------

async function sessionCleanup() {
  const { count } = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  logger.info({ deleted: count }, "jobs: session-cleanup done");
}

// ---------------------------------------------------------------------------
// Register all jobs
// ---------------------------------------------------------------------------

export function registerAllJobs() {
  registerJob("smart-playlist-refresh", "0 3 * * *", smartPlaylistRefresh);
  registerJob("email-digest-send", "0 8 * * 1", emailDigestSend);
  registerJob("analytics-aggregation", "0 * * * *", analyticsAggregation);
  registerJob("session-cleanup", "0 2 * * *", sessionCleanup);
}
