import { prisma } from "@/lib/prisma";
import { sendWeeklyHighlightsEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types (internal to the email-digest job)
// ---------------------------------------------------------------------------

interface DigestRecipient {
  id: string;
  email: string | null;
  unsubscribeToken: string | null;
  _count: { songs: number };
}

interface TrendingCandidate {
  id: string;
  title: string | null;
  tags: string | null;
  userId: string;
}

interface UserHighlights {
  topSongs: Array<{ id: string; title: string | null; playCount: number }>;
  weekGenerations: number;
  totalPlaysReceived: number;
  newFollowers: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEND_DELAY_MS = 150;
const ACTIVE_WINDOW_DAYS = 30;
const TRENDING_POOL_SIZE = 40;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_SONGS_LIMIT = 5;
const MAX_RECOMMENDATIONS = 5;

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

async function gatherUserHighlights(
  userId: string,
  now: number = Date.now()
): Promise<UserHighlights> {
  const oneWeekAgo = new Date(now - WEEK_MS);

  const [topSongs, weekGenerations, playsAggregate, newFollowers] =
    await Promise.all([
      prisma.song.findMany({
        where: {
          userId,
          generationStatus: "ready",
          createdAt: { gte: oneWeekAgo },
        },
        orderBy: { playCount: "desc" },
        take: TOP_SONGS_LIMIT,
        select: { id: true, title: true, playCount: true },
      }),
      prisma.song.count({
        where: {
          userId,
          createdAt: { gte: oneWeekAgo },
          generationStatus: "ready",
        },
      }),
      prisma.song.aggregate({
        where: { userId, generationStatus: "ready" },
        _sum: { playCount: true },
      }),
      prisma.follow.count({
        where: { followingId: userId, createdAt: { gte: oneWeekAgo } },
      }),
    ]);

  return {
    topSongs,
    weekGenerations,
    totalPlaysReceived: playsAggregate._sum.playCount ?? 0,
    newFollowers,
  };
}

export function selectRecommendations(
  pool: TrendingCandidate[],
  excludeUserId: string
): Array<{ id: string; title: string | null; tags: string | null }> {
  return pool
    .filter((s) => s.userId !== excludeUserId)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((s) => ({ id: s.id, title: s.title, tags: s.tags }));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

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
