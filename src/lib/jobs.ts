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

// Delay between individual email sends to avoid bursting Mailjet rate limits.
const EMAIL_SEND_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function emailDigestSend() {
  const now = Date.now();
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Fetch weekly digest users who were active in the last 30 days.
  // lastLoginAt is the best available activity proxy.
  const users = await prisma.user.findMany({
    where: {
      emailDigestFrequency: "weekly",
      email: { not: null },
      isDisabled: false,
      lastLoginAt: { gte: thirtyDaysAgo },
    },
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      _count: { select: { songs: true } },
    },
  });

  // Pre-fetch trending public songs (pool of 20) for recommendations.
  // Excludes songs by the digest recipient (filtered per-user below).
  const trendingPool = await prisma.song.findMany({
    where: { isPublic: true, generationStatus: "ready", isHidden: false },
    orderBy: { playCount: "desc" },
    take: 40,
    select: { id: true, title: true, tags: true, userId: true },
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;

    try {
      const [topSongs, weekGenerations, playsAggregate, newFollowers] = await Promise.all([
        // Top songs from this week by play count
        prisma.song.findMany({
          where: { userId: user.id, generationStatus: "ready", createdAt: { gte: oneWeekAgo } },
          orderBy: { playCount: "desc" },
          take: 5,
          select: { id: true, title: true, playCount: true },
        }),
        // Count of songs generated this week
        prisma.song.count({
          where: { userId: user.id, createdAt: { gte: oneWeekAgo }, generationStatus: "ready" },
        }),
        // Total plays across all user songs
        prisma.song.aggregate({
          where: { userId: user.id, generationStatus: "ready" },
          _sum: { playCount: true },
        }),
        // New followers gained this week
        prisma.follow.count({
          where: { followingId: user.id, createdAt: { gte: oneWeekAgo } },
        }),
      ]);

      // Recommend up to 5 trending songs the user didn't create
      const recommendedSongs = trendingPool
        .filter((s) => s.userId !== user.id)
        .slice(0, 5)
        .map((s) => ({ id: s.id, title: s.title, tags: s.tags }));

      await sendWeeklyHighlightsEmail(
        user.email,
        {
          topSongs,
          totalSongs: user._count.songs,
          weekGenerations,
          totalPlaysReceived: playsAggregate._sum.playCount ?? 0,
          newFollowers,
          recommendedSongs,
        },
        user.unsubscribeToken ?? user.id
      );
      sent++;
    } catch (err) {
      failed++;
      logger.error({ userId: user.id, err }, "jobs: email-digest-send user failed");
    }

    // Rate-limit: small pause between sends
    await sleep(EMAIL_SEND_DELAY_MS);
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
