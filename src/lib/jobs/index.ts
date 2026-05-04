import { registerJob } from "@/lib/scheduler";
import { refreshStalePlaylists } from "@/lib/smart-playlists";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
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

async function analyticsSnapshot(): Promise<void> {
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

export function registerAllJobs() {
  registerJob("smart-playlist-refresh", "0 3 * * *", smartPlaylistRefresh);
  registerJob("email-digest-send", "0 8 * * 1", emailDigestSend);
  registerJob("analytics-aggregation", "0 * * * *", analyticsSnapshot);
  registerJob("session-cleanup", "0 2 * * *", sessionCleanup);
}
