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

// ─── Narrative prompt templates keyed by mood ───

const MOOD_TEMPLATES: Record<string, string[]> = {
  energetic: [
    "An energetic anthem capturing the thrill of {theme}. {texture}",
    "A high-energy track fueled by {theme}. {texture}",
  ],
  chill: [
    "A laid-back groove reflecting on {theme}. {texture}",
    "A mellow, drifting piece inspired by {theme}. {texture}",
  ],
  melancholic: [
    "A bittersweet ballad about {theme}. {texture}",
    "A hauntingly beautiful song dwelling on {theme}. {texture}",
  ],
  romantic: [
    "A tender love song woven around {theme}. {texture}",
    "An intimate, heartfelt piece about {theme}. {texture}",
  ],
  uplifting: [
    "An uplifting anthem celebrating {theme}. {texture}",
    "A soaring, hopeful track inspired by {theme}. {texture}",
  ],
  dark: [
    "A brooding, atmospheric piece exploring {theme}. {texture}",
    "A shadowy soundscape immersed in {theme}. {texture}",
  ],
  dreamy: [
    "An ethereal, floating track drifting through {theme}. {texture}",
    "A dreamlike piece painting visions of {theme}. {texture}",
  ],
  intense: [
    "An epic, powerful track channeling {theme}. {texture}",
    "A relentless, storming piece driven by {theme}. {texture}",
  ],
};

const FALLBACK_TEMPLATES = [
  "A song inspired by {theme}. {texture}",
  "A track exploring the world of {theme}. {texture}",
];

function extractCoreTheme(excerpt: string): string {
  const sentenceMatch = excerpt.match(/^(.+?[.!?])\s/);
  const sentence = sentenceMatch ? sentenceMatch[1] : excerpt;

  if (sentence.length <= 120) return sentence.replace(/[.!?]+$/, "").trim();

  const truncated = sentence.slice(0, 120);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
}

function extractArticleContext(excerpt: string, maxLength: number): string {
  const sentences = excerpt
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const candidates = sentences.slice(1, 4);
  if (candidates.length === 0) return "";

  let result = "";
  for (const sentence of candidates) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length > maxLength) {
      if (!result) {
        const truncated = sentence.slice(0, maxLength);
        const lastSpace = truncated.lastIndexOf(" ");
        result = (lastSpace > 40 ? truncated.slice(0, lastSpace) : truncated).trim();
        if (!/[.!?]$/.test(result)) result += ".";
      }
      break;
    }
    result = next;
  }

  return result;
}

/**
 * Build a texture description from topics and mood-style info.
 */
function buildTexture(item: RssItem): string {
  const parts: string[] = [];

  // Use suggestedStyle from enrichItem when available (richer than raw topics)
  if (item.suggestedStyle) {
    parts.push(item.suggestedStyle + " feel");
  } else {
    if (item.topics && item.topics.length > 0) {
      parts.push(item.topics.slice(0, 3).join(" and ") + " textures");
    }
    if (item.mood && item.mood !== "neutral") {
      parts.push(`${item.mood} energy`);
    }
  }

  return parts.length > 0
    ? parts.join(" with ")
    : "indie, alternative feel";
}

function buildPromptFromItem(item: RssItem): { name: string; prompt: string; style: string } {
  const titleClean = item.title.replace(/\s+/g, " ").trim();
  const excerpt = item.excerpt || item.description || "";
  const hasContent = excerpt.length > 20;

  let prompt: string;

  if (hasContent) {
    // ── Narrative path: use excerpt to derive a content-aware prompt ──
    const theme = extractCoreTheme(excerpt);
    const texture = buildTexture(item);

    const templates =
      (item.mood && MOOD_TEMPLATES[item.mood]) || FALLBACK_TEMPLATES;
    const template = templates[titleClean.length % templates.length];

    prompt = template.replace("{theme}", theme).replace("{texture}", texture);

    const TARGET_MAX = 400;
    const contextBudget = TARGET_MAX - prompt.length - 1;
    if (contextBudget > 40) {
      const context = extractArticleContext(excerpt, contextBudget);
      if (context) {
        prompt = `${prompt} ${context}`;
      }
    }
  } else {
    // ── Fallback: keyword-only prompt (original behavior) ──
    const parts: string[] = [];
    if (item.mood && item.mood !== "neutral") parts.push(`${item.mood} mood`);
    if (item.topics && item.topics.length > 0) parts.push(item.topics.join(", "));
    if (titleClean.length > 5 && titleClean.length < 120) {
      parts.push(`inspired by "${titleClean}"`);
    }
    prompt = parts.length > 0 ? parts.join(". ") : titleClean;
  }

  // Build style from suggestedStyle (preferred) or mood + topics
  const style =
    item.suggestedStyle ||
    [
      item.mood && item.mood !== "neutral" ? item.mood : "",
      ...(item.topics?.slice(0, 3) ?? []),
    ]
      .filter(Boolean)
      .join(", ");

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
        { error: "No RSS feeds configured. Add feeds in Settings first.", code: "VALIDATION_ERROR" },
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
        { error: "No feed items found. Your RSS feeds may be empty or unreachable.", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Score items by richness (mood, topics, content quality) and pick top N
    const ranked = allItems
      .map((item) => ({ item, score: scoreItem(item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_DAILY_PROMPTS);

    // Generate prompts from top items
    const generated = ranked.map(({ item }) => ({
      ...buildPromptFromItem(item),
      excerpt: item.excerpt ?? null,
    }));

    // Optionally boost style via sunoapi
    if (boost) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sunoApiKey: true },
      });
      const apiKey = user?.sunoApiKey || process.env.SUNOAPI_KEY;

      for (const entry of generated) {
        try {
          // Pass full excerpt + title for richer style generation;
          // fall back to the terse prompt when excerpt is unavailable
          const boostInput = entry.excerpt
            ? `${entry.name}: ${entry.excerpt}`
            : entry.prompt;
          const result = await boostStyle(boostInput, apiKey ?? undefined);
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

    // Attach excerpt from the source feed item to each prompt
    const result = prompts.map((p, i) => ({
      ...p,
      excerpt: generated[i].excerpt,
    }));

    return NextResponse.json({ prompts: result });
  } catch {
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
