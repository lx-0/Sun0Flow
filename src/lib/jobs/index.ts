import { registerJob } from "@/lib/scheduler";
import { refreshStalePlaylists } from "@/lib/smart-playlists";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { countActiveUsers } from "@/lib/active-users";
import { emailDigestSend } from "./email-digest";

async function smartPlaylistRefresh(): Promise<void> {
  const { refreshed, skipped } = await refreshStalePlaylists();
  logger.info({ refreshed, skipped }, "jobs: smart-playlist-refresh done");
}

async function sessionCleanup(): Promise<void> {
  const { count } = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  logger.info({ deleted: count }, "jobs: session-cleanup done");
}

// Rate-limit windows are at most 1h, so anything older than 7d is dead weight.
// `generate` entries are kept (dashboard `/api/dashboard/usage` reads them as a
// lifetime/30d generation history). All other actions — reactions, comments,
// downloads, lyrics_generate, rss_fetch, verification_email — are pure slot
// markers with high cardinality (e.g. `reaction:<songId>`) and need cleanup.
async function rateLimitEntryCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count: userCount } = await prisma.rateLimitEntry.deleteMany({
    where: { createdAt: { lt: cutoff }, action: { not: "generate" } },
  });
  const { count: anonCount } = await prisma.anonRateLimitEntry.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  logger.info(
    { deletedUser: userCount, deletedAnon: anonCount },
    "jobs: rate-limit-cleanup done"
  );
}

async function analyticsSnapshot(): Promise<void> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [totalUsers, totalSongs, generationsLastHour, activeUsersToday] =
    await Promise.all([
      prisma.user.count({ where: { isDisabled: false } }),
      prisma.song.count({ where: { generationStatus: "ready" } }),
      prisma.song.count({ where: { createdAt: { gte: oneHourAgo } } }),
      countActiveUsers(oneDayAgo),
    ]);

  logger.info(
    { totalUsers, totalSongs, generationsLastHour, activeUsersToday },
    "jobs: analytics-aggregation snapshot"
  );
}

export function registerAllJobs() {
  registerJob("smart-playlist-refresh", "0 3 * * *", smartPlaylistRefresh);
  registerJob("email-digest-send", "0 8 * * 1", async () => { await emailDigestSend(); });
  registerJob("analytics-aggregation", "0 * * * *", analyticsSnapshot);
  registerJob("session-cleanup", "0 2 * * *", sessionCleanup);
  registerJob("rate-limit-cleanup", "30 2 * * *", rateLimitEntryCleanup);
}
