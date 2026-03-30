import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWeeklyHighlightsEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import crypto from "crypto";

// Internal-only endpoint for triggering weekly Music Recap emails.
// Must be protected by CRON_SECRET to prevent abuse.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Find opted-in weekly digest users who are active in the last 30 days.
  // Only "weekly" frequency users — daily/monthly handled by separate cron schedules.
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

  // Pre-fetch trending pool for recommendations
  const trendingPool = await prisma.song.findMany({
    where: { isPublic: true, generationStatus: "ready", isHidden: false },
    orderBy: { playCount: "desc" },
    take: 40,
    select: { id: true, title: true, tags: true, userId: true },
  });

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    if (!user.email) continue;

    try {
      // Ensure unsubscribe token exists
      let unsubToken = user.unsubscribeToken;
      if (!unsubToken) {
        unsubToken = crypto.randomUUID();
        await prisma.user.update({
          where: { id: user.id },
          data: { unsubscribeToken: unsubToken },
        });
      }

      const [weekGenerations, topSongs, playsAggregate, newFollowers] = await Promise.all([
        prisma.song.count({
          where: { userId: user.id, createdAt: { gte: weekAgo }, generationStatus: "ready" },
        }),
        prisma.song.findMany({
          where: { userId: user.id, generationStatus: "ready", createdAt: { gte: weekAgo } },
          orderBy: { playCount: "desc" },
          take: 5,
          select: { id: true, title: true, playCount: true },
        }),
        prisma.song.aggregate({
          where: { userId: user.id, generationStatus: "ready" },
          _sum: { playCount: true },
        }),
        prisma.follow.count({
          where: { followingId: user.id, createdAt: { gte: weekAgo } },
        }),
      ]);

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
        unsubToken
      );
      sent++;
    } catch (err) {
      logger.error({ userId: user.id, err }, "weekly-highlights: failed to send email");
      errors++;
    }
  }

  logger.info({ sent, errors, total: users.length }, "weekly-highlights: batch complete");
  return NextResponse.json({ sent, errors, total: users.length });
}
