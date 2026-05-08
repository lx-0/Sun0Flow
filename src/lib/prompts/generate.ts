import type { PromptTemplate } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchFeed } from "@/lib/rss";
import { boostStyle } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { rankItems, buildPromptFromItem } from "./build-prompt";

const MAX_DAILY_PROMPTS = 5;
const CATEGORY = "auto-generated";

export interface GeneratePromptsOptions {
  boost?: boolean;
}

export type GeneratePromptsResult =
  | { ok: true; prompts: Array<PromptTemplate & { excerpt: string | null }> }
  | { ok: false; code: "NO_FEEDS"; message: string }
  | { ok: false; code: "NO_ITEMS"; message: string };

export async function generatePromptsFromFeeds(
  userId: string,
  options?: GeneratePromptsOptions,
): Promise<GeneratePromptsResult> {
  const feeds = await prisma.rssFeedSubscription.findMany({
    where: { userId },
    select: { url: true },
  });

  if (feeds.length === 0) {
    return {
      ok: false,
      code: "NO_FEEDS",
      message: "No RSS feeds configured. Add feeds in Settings first.",
    };
  }

  const feedResults = await Promise.all(feeds.map((f) => fetchFeed(f.url)));
  const allItems = feedResults
    .filter((f) => !f.error)
    .flatMap((f) => f.items);

  if (allItems.length === 0) {
    return {
      ok: false,
      code: "NO_ITEMS",
      message:
        "No feed items found. Your RSS feeds may be empty or unreachable.",
    };
  }

  const topItems = rankItems(allItems, MAX_DAILY_PROMPTS);
  const generated = topItems.map((item) => buildPromptFromItem(item));

  if (options?.boost) {
    const userKey = await resolveUserApiKey(userId);
    const apiKey = userKey || process.env.SUNOAPI_KEY;

    for (const entry of generated) {
      try {
        const boostInput = entry.excerpt
          ? `${entry.name}: ${entry.excerpt}`
          : entry.prompt;
        const result = await boostStyle(boostInput, apiKey ?? undefined);
        if (result.result) {
          entry.style = result.result;
        }
      } catch {
        // Keep original style on boost failure
      }
    }
  }

  await prisma.promptTemplate.deleteMany({
    where: { userId, category: CATEGORY },
  });

  const created = await Promise.all(
    generated.map((entry) =>
      prisma.promptTemplate.create({
        data: {
          userId,
          name: entry.name,
          prompt: entry.prompt,
          style: entry.style || null,
          category: CATEGORY,
          description: "Auto-generated from your feed content",
          isBuiltIn: false,
          isInstrumental: false,
        },
      }),
    ),
  );

  return {
    ok: true,
    prompts: created.map((p, i) => ({
      ...p,
      excerpt: generated[i].excerpt,
    })),
  };
}
