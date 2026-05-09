import { prisma } from "@/lib/prisma";
import { fetchFeed } from "./index";
import { generateSong } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { checkCredits, deductCredits } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { createNotification } from "@/lib/notifications";
import { buildSimplePromptFromItem } from "@/lib/prompts";

const MAX_AUTO_PER_USER = 10;

export interface AutoGenerateResult {
  processed: number;
  generated: number;
}

interface AutoFeed {
  id: string;
  userId: string;
  url: string;
  title: string | null;
  lastCheckedAt: Date | null;
}

function groupByUser(feeds: AutoFeed[]): Map<string, AutoFeed[]> {
  const map = new Map<string, AutoFeed[]>();
  for (const feed of feeds) {
    const list = map.get(feed.userId) ?? [];
    list.push(feed);
    map.set(feed.userId, list);
  }
  return map;
}

async function hasReachedDailyLimit(
  feedId: string,
  todayStart: Date,
): Promise<boolean> {
  const count = await prisma.song.count({
    where: {
      rssFeedSubscriptionId: feedId,
      source: "auto",
      createdAt: { gte: todayStart },
    },
  });
  return count >= 1;
}

async function findNewItem(
  feed: AutoFeed,
): Promise<{ title: string; description: string; content?: string; mood?: string; topics?: string[]; suggestedStyle?: string } | null> {
  const result = await fetchFeed(feed.url);
  if (result.error || result.items.length === 0) return null;

  const lastChecked = feed.lastCheckedAt;
  const newItems = lastChecked
    ? result.items.filter((item) => {
        if (!item.pubDate) return false;
        const pubDate = new Date(item.pubDate);
        return !isNaN(pubDate.getTime()) && pubDate > lastChecked;
      })
    : result.items.slice(0, 1);

  return newItems[0] ?? null;
}

async function generateFromFeedItem(
  userId: string,
  feed: AutoFeed,
  item: { title: string; description: string; content?: string; mood?: string; topics?: string[]; suggestedStyle?: string },
  apiKey: string | undefined,
  usingPersonalKey: boolean,
  now: Date,
): Promise<boolean> {
  const { prompt, style } = buildSimplePromptFromItem(item);
  if (!prompt) return false;

  if (!usingPersonalKey) {
    const recheck = await checkCredits(userId, "generate");
    if (!recheck.ok) {
      logger.info({ userId }, "feed-auto-generate: insufficient credits for next generation, stopping user");
      return false;
    }
  }

  logger.info(
    { feedId: feed.id, userId, prompt: prompt.slice(0, 80) },
    "feed-auto-generate: starting song generation",
  );

  let song;
  try {
    const genResult = await generateSong(
      prompt,
      { style: style || undefined, title: item.title?.slice(0, 100) || undefined },
      apiKey ?? undefined,
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

    try {
      const [placeholderVariant] = generateCoverArtVariants({
        songId: song.id,
        title: item.title?.slice(0, 100),
        tags: style,
      });
      prisma.song
        .update({ where: { id: song.id }, data: { imageUrl: placeholderVariant.dataUrl } })
        .catch(() => {});
    } catch {
      // Non-critical
    }
  } catch (genErr) {
    logger.error(
      { feedId: feed.id, userId, genErr },
      "feed-auto-generate: generation API call failed",
    );
    await prisma.rssFeedSubscription.update({
      where: { id: feed.id },
      data: { lastCheckedAt: now },
    });
    return false;
  }

  if (!usingPersonalKey) {
    await deductCredits(userId, "generate", {
      songId: song.id,
      description: `Auto-generated from feed: ${feed.title ?? feed.url}`,
    }).catch(() => {});
  }

  await createNotification({
    userId,
    type: "generation_complete",
    title: "Auto-generation started",
    message: `Generating a song from "${feed.title ?? "RSS feed"}" — inspired by "${item.title?.slice(0, 80) ?? "a new item"}"`,
    songId: song.id,
  }).catch(() => {});

  await prisma.rssFeedSubscription.update({
    where: { id: feed.id },
    data: { lastCheckedAt: now },
  });

  return true;
}

export async function processAutoGenerateFeeds(): Promise<AutoGenerateResult> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

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

  if (autoFeeds.length === 0) return { processed: 0, generated: 0 };

  const feedsByUser = groupByUser(autoFeeds);
  let totalGenerated = 0;
  let totalProcessed = 0;

  for (const [userId, feeds] of Array.from(feedsByUser)) {
    const { apiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);

    if (!usingPersonalKey) {
      const creditCheck = await checkCredits(userId, "generate");
      if (!creditCheck.ok) {
        logger.info(
          { userId, creditsRemaining: creditCheck.creditsRemaining },
          "feed-auto-generate: insufficient credits, skipping user",
        );
        continue;
      }
    }

    let slotsRemaining = MAX_AUTO_PER_USER;

    for (const feed of feeds) {
      if (slotsRemaining <= 0) break;
      totalProcessed++;

      try {
        if (await hasReachedDailyLimit(feed.id, todayStart)) {
          logger.info(
            { feedId: feed.id, userId },
            "feed-auto-generate: daily limit reached for feed, skipping",
          );
          continue;
        }

        const item = await findNewItem(feed);
        if (!item) continue;

        const generated = await generateFromFeedItem(
          userId,
          feed,
          item,
          apiKey,
          usingPersonalKey,
          now,
        );

        if (generated) {
          totalGenerated++;
          slotsRemaining--;
        } else if (!usingPersonalKey) {
          // generateFromFeedItem returns false for credit exhaustion — stop this user
          break;
        }
      } catch (err) {
        logger.error(
          { feedId: feed.id, userId, err },
          "feed-auto-generate: error processing feed",
        );
      }
    }
  }

  logger.info(
    { processed: totalProcessed, generated: totalGenerated },
    "feed-auto-generate: complete",
  );
  return { processed: totalProcessed, generated: totalGenerated };
}
