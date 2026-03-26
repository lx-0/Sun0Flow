import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFeed } from "@/lib/rss";
import { generateSong } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { getMonthlyCreditUsage, recordCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";

/**
 * POST /api/cron/feed-auto-generate
 *
 * Checks all RSS feeds with autoGenerate=true for new items since last check.
 * Directly generates one song per feed per day for matching new items.
 * Sends a notification when generation starts.
 *
 * Protected by CRON_SECRET bearer token.
 */

const MAX_AUTO_PER_USER = 10; // max songs auto-generated per cron run per user

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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // Find all feeds with autoGenerate enabled
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
    return NextResponse.json({ processed: 0, generated: 0 });
  }

  // Group feeds by userId
  const feedsByUser = new Map<string, typeof autoFeeds>();
  for (const feed of autoFeeds) {
    const list = feedsByUser.get(feed.userId) ?? [];
    list.push(feed);
    feedsByUser.set(feed.userId, list);
  }

  let totalGenerated = 0;
  let totalProcessed = 0;

  for (const [userId, feeds] of Array.from(feedsByUser)) {
    // Resolve user's API key
    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);

    // Check credits (skip check for personal key users)
    if (!usingPersonalKey) {
      const creditUsage = await getMonthlyCreditUsage(userId);
      if (creditUsage.creditsRemaining < CREDIT_COSTS.generate) {
        logger.info({ userId, creditsRemaining: creditUsage.creditsRemaining }, "feed-auto-generate: insufficient credits, skipping user");
        continue;
      }
    }

    let slotsRemaining = MAX_AUTO_PER_USER;

    for (const feed of feeds) {
      if (slotsRemaining <= 0) break;
      totalProcessed++;

      try {
        // Daily limit: max 1 auto-generated song per feed per day
        const autoToday = await prisma.song.count({
          where: {
            rssFeedSubscriptionId: feed.id,
            source: "auto",
            createdAt: { gte: todayStart },
          },
        });
        if (autoToday >= 1) {
          logger.info({ feedId: feed.id, userId }, "feed-auto-generate: daily limit reached for feed, skipping");
          continue;
        }

        const result = await fetchFeed(feed.url);
        if (result.error || result.items.length === 0) continue;

        // Filter to items newer than lastCheckedAt
        const lastChecked = feed.lastCheckedAt;
        const newItems = lastChecked
          ? result.items.filter((item) => {
              if (!item.pubDate) return false;
              const pubDate = new Date(item.pubDate);
              return !isNaN(pubDate.getTime()) && pubDate > lastChecked;
            })
          : result.items.slice(0, 1); // First run: take top item only

        if (newItems.length === 0) continue;

        // Pick the first new item to generate from
        const item = newItems[0];
        const { prompt, style } = buildPromptFromItem(item);
        if (!prompt) continue;

        // Re-check credits per generation
        if (!usingPersonalKey) {
          const creditUsage = await getMonthlyCreditUsage(userId);
          if (creditUsage.creditsRemaining < CREDIT_COSTS.generate) {
            logger.info({ userId }, "feed-auto-generate: insufficient credits for next generation, stopping user");
            break;
          }
        }

        logger.info({ feedId: feed.id, userId, prompt: prompt.slice(0, 80) }, "feed-auto-generate: starting song generation");

        let song;
        try {
          const genResult = await generateSong(
            prompt,
            { style: style || undefined, title: item.title?.slice(0, 100) || undefined },
            userApiKey ?? undefined
          );

          song = await prisma.song.create({
            data: {
              userId,
              sunoJobId: genResult.taskId,
              prompt,
              tags: style || null,
              title: item.title?.slice(0, 200) || null,
              generationStatus: "pending",
              source: "auto",
              rssFeedSubscriptionId: feed.id,
            },
          });

          // Assign placeholder cover art
          try {
            const [placeholderVariant] = generateCoverArtVariants({
              songId: song.id,
              title: item.title?.slice(0, 100),
              tags: style,
            });
            prisma.song.update({
              where: { id: song.id },
              data: { imageUrl: placeholderVariant.dataUrl },
            }).catch(() => {});
          } catch {
            // Non-critical
          }
        } catch (genErr) {
          logger.error({ feedId: feed.id, userId, genErr }, "feed-auto-generate: generation API call failed");
          // Update lastCheckedAt anyway so we don't retry the same items endlessly
          await prisma.rssFeedSubscription.update({
            where: { id: feed.id },
            data: { lastCheckedAt: now },
          });
          continue;
        }

        // Record credit usage
        if (!usingPersonalKey) {
          await recordCreditUsage(userId, "generate", {
            songId: song.id,
            creditCost: CREDIT_COSTS.generate,
            description: `Auto-generated from feed: ${feed.title ?? feed.url}`,
          }).catch(() => {});
        }

        // Notify user that auto-generation has started
        await prisma.notification.create({
          data: {
            userId,
            type: "generation_complete",
            title: "Auto-generation started",
            message: `Generating a song from "${feed.title ?? "RSS feed"}" — inspired by "${item.title?.slice(0, 80) ?? "a new item"}"`,
            songId: song.id,
          },
        }).catch(() => {});

        // Update lastCheckedAt
        await prisma.rssFeedSubscription.update({
          where: { id: feed.id },
          data: { lastCheckedAt: now },
        });

        totalGenerated++;
        slotsRemaining--;
      } catch (err) {
        logger.error({ feedId: feed.id, userId, err }, "feed-auto-generate: error processing feed");
      }
    }
  }

  logger.info({ processed: totalProcessed, generated: totalGenerated }, "feed-auto-generate: complete");
  return NextResponse.json({ processed: totalProcessed, generated: totalGenerated });
}
