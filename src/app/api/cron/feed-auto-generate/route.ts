import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFeed } from "@/lib/rss";
import { logger } from "@/lib/logger";
import { getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";

/**
 * POST /api/cron/feed-auto-generate
 *
 * Checks all RSS feeds with autoGenerate=true for new items since last check.
 * Creates PendingFeedGeneration records for new items, respecting each user's
 * remaining credit budget.
 *
 * Protected by CRON_SECRET bearer token.
 */

const MAX_PENDING_PER_USER = 20;

function buildPromptFromItem(item: {
  title: string;
  description: string;
  mood?: string;
  topics?: string[];
}): { prompt: string; style: string } {
  const parts: string[] = [];

  if (item.mood && item.mood !== "neutral") {
    parts.push(`${item.mood} mood`);
  }
  if (item.topics && item.topics.length > 0) {
    parts.push(item.topics.join(", "));
  }
  const titleClean = item.title.replace(/\s+/g, " ").trim();
  if (titleClean.length > 5 && titleClean.length < 120) {
    parts.push(`inspired by "${titleClean}"`);
  }

  const prompt = parts.length > 0 ? parts.join(". ") : titleClean;

  const styleParts: string[] = [];
  if (item.mood && item.mood !== "neutral") styleParts.push(item.mood);
  if (item.topics && item.topics.length > 0) styleParts.push(...item.topics.slice(0, 3));

  return { prompt, style: styleParts.join(", ") };
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();

  // Find all feeds with autoGenerate enabled, group by userId
  const autoFeeds = await prisma.rssFeedSubscription.findMany({
    where: { autoGenerate: true },
    select: {
      id: true,
      userId: true,
      url: true,
      title: true,
      lastCheckedAt: true,
    },
    orderBy: { userId: "asc" },
  });

  if (autoFeeds.length === 0) {
    return NextResponse.json({ processed: 0, created: 0 });
  }

  // Group feeds by userId to do per-user credit checks once
  const feedsByUser = new Map<string, typeof autoFeeds>();
  for (const feed of autoFeeds) {
    const list = feedsByUser.get(feed.userId) ?? [];
    list.push(feed);
    feedsByUser.set(feed.userId, list);
  }

  let totalCreated = 0;
  let totalProcessed = 0;

  for (const [userId, feeds] of Array.from(feedsByUser)) {
    // Check how many pending items the user already has
    const pendingCount = await prisma.pendingFeedGeneration.count({
      where: { userId, status: "pending" },
    });

    if (pendingCount >= MAX_PENDING_PER_USER) {
      logger.info({ userId }, "feed-auto-generate: user already has max pending items, skipping");
      continue;
    }

    // Check user's remaining credits — don't queue more than credits allow
    const creditUsage = await getMonthlyCreditUsage(userId);
    const creditCostPerGen = CREDIT_COSTS.generate ?? 10;
    const maxNewFromCredits = Math.floor(creditUsage.creditsRemaining / creditCostPerGen);
    const maxNewFromLimit = MAX_PENDING_PER_USER - pendingCount;
    let slotsRemaining = Math.min(maxNewFromCredits, maxNewFromLimit);

    if (slotsRemaining <= 0) {
      logger.info({ userId, creditsRemaining: creditUsage.creditsRemaining }, "feed-auto-generate: insufficient credits, skipping");
      continue;
    }

    for (const feed of feeds) {
      if (slotsRemaining <= 0) break;
      totalProcessed++;

      try {
        const result = await fetchFeed(feed.url);
        if (result.error || result.items.length === 0) continue;

        // Filter to items newer than lastCheckedAt (by pubDate if available)
        const lastChecked = feed.lastCheckedAt;
        const newItems = lastChecked
          ? result.items.filter((item) => {
              if (!item.pubDate) return false;
              const pubDate = new Date(item.pubDate);
              return !isNaN(pubDate.getTime()) && pubDate > lastChecked;
            })
          : result.items.slice(0, 3); // First run: take top 3 items

        if (newItems.length === 0) continue;

        for (const item of newItems) {
          if (slotsRemaining <= 0) break;

          const { prompt, style } = buildPromptFromItem(item);
          if (!prompt) continue;

          // Deduplicate by itemTitle + userId to avoid re-queuing the same article
          const existing = await prisma.pendingFeedGeneration.findFirst({
            where: {
              userId,
              feedSubscriptionId: feed.id,
              itemTitle: item.title.slice(0, 255),
            },
          });
          if (existing) continue;

          await prisma.pendingFeedGeneration.create({
            data: {
              userId,
              feedSubscriptionId: feed.id,
              feedTitle: feed.title ?? result.feedTitle,
              itemTitle: item.title.slice(0, 255),
              itemLink: item.link ?? null,
              itemPubDate: item.pubDate ?? null,
              prompt,
              style: style || null,
              status: "pending",
            },
          });

          totalCreated++;
          slotsRemaining--;
        }

        // Update lastCheckedAt for this feed
        await prisma.rssFeedSubscription.update({
          where: { id: feed.id },
          data: { lastCheckedAt: now },
        });
      } catch (err) {
        logger.error({ feedId: feed.id, userId, err }, "feed-auto-generate: error processing feed");
      }
    }
  }

  logger.info({ processed: totalProcessed, created: totalCreated }, "feed-auto-generate: complete");
  return NextResponse.json({ processed: totalProcessed, created: totalCreated });
}
