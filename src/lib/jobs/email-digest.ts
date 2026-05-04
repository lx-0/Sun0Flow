import { prisma } from "@/lib/prisma";
import { sendWeeklyHighlightsEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { gatherUserHighlights } from "./gather-user-highlights";
import { selectRecommendations } from "./select-recommendations";
import type { DigestRecipient, TrendingCandidate } from "./types";

const SEND_DELAY_MS = 150;
const ACTIVE_WINDOW_DAYS = 30;
const TRENDING_POOL_SIZE = 40;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchDigestRecipients(): Promise<DigestRecipient[]> {
  const cutoff = new Date(
    Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  return prisma.user.findMany({
    where: {
      emailDigestFrequency: "weekly",
      email: { not: null },
      isDisabled: false,
      lastLoginAt: { gte: cutoff },
    },
    select: {
      id: true,
      email: true,
      unsubscribeToken: true,
      _count: { select: { songs: true } },
    },
  });
}

async function fetchTrendingPool(): Promise<TrendingCandidate[]> {
  return prisma.song.findMany({
    where: { isPublic: true, generationStatus: "ready", isHidden: false },
    orderBy: { playCount: "desc" },
    take: TRENDING_POOL_SIZE,
    select: { id: true, title: true, tags: true, userId: true },
  });
}

export async function emailDigestSend(): Promise<void> {
  const now = Date.now();
  const users = await fetchDigestRecipients();
  const trendingPool = await fetchTrendingPool();

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (!user.email) continue;

    try {
      const highlights = await gatherUserHighlights(user.id, now);
      const recommendedSongs = selectRecommendations(trendingPool, user.id);

      await sendWeeklyHighlightsEmail(
        user.email,
        {
          topSongs: highlights.topSongs,
          totalSongs: user._count.songs,
          weekGenerations: highlights.weekGenerations,
          totalPlaysReceived: highlights.totalPlaysReceived,
          newFollowers: highlights.newFollowers,
          recommendedSongs,
        },
        user.unsubscribeToken ?? user.id
      );
      sent++;
    } catch (err) {
      failed++;
      logger.error(
        { userId: user.id, err },
        "jobs: email-digest-send user failed"
      );
    }

    await sleep(SEND_DELAY_MS);
  }

  logger.info(
    { sent, failed, total: users.length },
    "jobs: email-digest-send done"
  );
}
