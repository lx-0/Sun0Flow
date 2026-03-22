import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { fetchFeed, type RssItem } from "@/lib/rss";
import { boostStyle } from "@/lib/sunoapi";

/**
 * POST /api/prompts/generate
 *
 * Fetches the user's RSS feeds, extracts keywords/mood/themes from recent items,
 * generates music prompts, optionally boosts them via sunoapi, and stores as PromptTemplate records.
 *
 * Body (optional):
 *   { boost?: boolean }  — whether to enhance prompts via sunoapi boostStyle (costs credits)
 *
 * Returns: { prompts: PromptTemplate[] }
 */

const MAX_DAILY_PROMPTS = 5;
const CATEGORY = "auto-generated";

function buildPromptFromItem(item: RssItem): { name: string; prompt: string; style: string } {
  const parts: string[] = [];

  // Build a concise music generation prompt from feed item metadata
  if (item.mood && item.mood !== "neutral") {
    parts.push(`${item.mood} mood`);
  }

  if (item.topics && item.topics.length > 0) {
    parts.push(item.topics.join(", "));
  }

  // Use first meaningful sentence from title
  const titleClean = item.title.replace(/\s+/g, " ").trim();
  if (titleClean.length > 5 && titleClean.length < 120) {
    parts.push(`inspired by "${titleClean}"`);
  }

  const prompt = parts.length > 0 ? parts.join(". ") : titleClean;

  // Build style from mood + topics
  const styleParts: string[] = [];
  if (item.mood && item.mood !== "neutral") styleParts.push(item.mood);
  if (item.topics && item.topics.length > 0) styleParts.push(...item.topics.slice(0, 3));
  const style = styleParts.join(", ");

  return {
    name: titleClean.slice(0, 60) || "Auto-generated prompt",
    prompt,
    style,
  };
}

function scoreItem(item: RssItem): number {
  let score = 0;
  if (item.mood && item.mood !== "neutral") score += 2;
  if (item.topics && item.topics.length > 0) score += item.topics.length;
  if (item.title && item.title.length > 10) score += 1;
  if (item.description && item.description.length > 20) score += 1;
  return score;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(req);

    if (authError) return authError;

    let boost = false;
    try {
      const body = await req.json();
      boost = Boolean(body?.boost);
    } catch {
      // No body or invalid JSON — that's fine, defaults apply
    }

    // Fetch user's RSS feed subscriptions
    const feeds = await prisma.rssFeedSubscription.findMany({
      where: { userId },
      select: { url: true },
    });

    if (feeds.length === 0) {
      return NextResponse.json(
        { error: "No RSS feeds configured. Add feeds in Settings first." },
        { status: 400 }
      );
    }

    // Fetch feed content
    const feedResults = await Promise.all(feeds.map((f) => fetchFeed(f.url)));

    // Collect all items, score and rank them
    const allItems: RssItem[] = feedResults
      .filter((f) => !f.error)
      .flatMap((f) => f.items);

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: "No feed items found. Your RSS feeds may be empty or unreachable." },
        { status: 400 }
      );
    }

    // Score items by richness (mood, topics, content quality) and pick top N
    const ranked = allItems
      .map((item) => ({ item, score: scoreItem(item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DAILY_PROMPTS);

    // Generate prompts from top items
    const generated = ranked.map(({ item }) => buildPromptFromItem(item));

    // Optionally boost style via sunoapi
    if (boost) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sunoApiKey: true },
      });
      const apiKey = user?.sunoApiKey || process.env.SUNOAPI_KEY;

      for (const entry of generated) {
        try {
          const result = await boostStyle(entry.prompt, apiKey ?? undefined);
          if (result.result) {
            entry.style = result.result;
          }
        } catch {
          // If boost fails, keep the original style — not critical
        }
      }
    }

    // Delete old auto-generated prompts for this user (keep it fresh)
    await prisma.promptTemplate.deleteMany({
      where: { userId, category: CATEGORY },
    });

    // Save as PromptTemplate records
    const prompts = await Promise.all(
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
        })
      )
    );

    return NextResponse.json({ prompts });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
