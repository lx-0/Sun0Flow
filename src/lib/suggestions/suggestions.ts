import { prisma } from "@/lib/prisma";
import { cached, CacheTTL } from "@/lib/cache";

// ── Public types ───────────────────────────────────────────────────────────────

export interface PromptSuggestion {
  id: string;
  label: string;
  stylePrompt: string;
  isInstrumental: boolean;
  source: "personal" | "community" | "curated";
}

export interface TrendingCombo {
  id: string;
  combo: string;
  label: string;
  stylePrompt: string;
  likes: number;
  total: number;
  score: number;
  displayScore: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 5;
const MAX_TRENDING = 5;
const TRENDING_CACHE_KEY = "trending-combos:v1";
const TRENDING_WINDOW_DAYS = 30;
const MIN_FEEDBACK_THRESHOLD = 3;

const CURATED_DEFAULTS: Array<{ stylePrompt: string; isInstrumental: boolean }> = [
  { stylePrompt: "pop, upbeat, catchy, female vocals", isInstrumental: false },
  { stylePrompt: "lo-fi hip hop, chill, relaxing, jazzy", isInstrumental: true },
  { stylePrompt: "epic orchestral, cinematic, dramatic", isInstrumental: true },
  { stylePrompt: "indie folk, acoustic, heartfelt, singer-songwriter", isInstrumental: false },
  { stylePrompt: "electronic, synth, 80s retro, danceable", isInstrumental: false },
];

// ── Internal helpers ───────────────────────────────────────────────────────────

function normalizeTags(tags: string): string {
  return tags.toLowerCase().trim();
}

function makeId(prefix: string, key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(16).slice(0, 8)}`;
}

function makeLabelFromParts(raw: string, separator: string): string {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3).join(separator);
}

type TagEntry = { stylePrompt: string; isInstrumental: boolean; count: number };

function aggregateByTag(
  songs: Array<{ tags: string | null; isInstrumental: boolean }>,
): TagEntry[] {
  const counts = new Map<string, TagEntry>();

  for (const song of songs) {
    if (!song.tags?.trim()) continue;
    const key = normalizeTags(song.tags);
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        stylePrompt: song.tags.trim(),
        isInstrumental: song.isInstrumental,
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function collectSuggestions(
  entries: TagEntry[],
  source: PromptSuggestion["source"],
  seen: Set<string>,
  target: PromptSuggestion[],
): void {
  for (const entry of entries) {
    if (target.length >= MAX_SUGGESTIONS) break;
    const key = normalizeTags(entry.stylePrompt);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push({
      id: makeId(source, key),
      label: makeLabelFromParts(entry.stylePrompt, ", "),
      stylePrompt: entry.stylePrompt,
      isInstrumental: entry.isInstrumental,
      source,
    });
  }
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function getPromptSuggestions(
  userId: string,
): Promise<PromptSuggestion[]> {
  const suggestions: PromptSuggestion[] = [];
  const seen = new Set<string>();

  const personalSongs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      tags: { not: null },
      OR: [
        { ratings: { some: { userId, value: { gte: 4 } } } },
        { generationFeedbacks: { some: { userId, rating: "thumbs_up" } } },
      ],
    },
    select: { tags: true, isInstrumental: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  collectSuggestions(aggregateByTag(personalSongs), "personal", seen, suggestions);

  if (suggestions.length < MAX_SUGGESTIONS) {
    const communitySongs = await prisma.song.findMany({
      where: {
        isPublic: true,
        isHidden: false,
        generationStatus: "ready",
        tags: { not: null },
        userId: { not: userId },
        ratings: { some: { value: { gte: 4 } } },
      },
      select: { tags: true, isInstrumental: true },
      orderBy: { playCount: "desc" },
      take: 200,
    });

    collectSuggestions(aggregateByTag(communitySongs), "community", seen, suggestions);
  }

  for (const def of CURATED_DEFAULTS) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    const key = normalizeTags(def.stylePrompt);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: makeId("curated", key),
      label: makeLabelFromParts(def.stylePrompt, ", "),
      stylePrompt: def.stylePrompt,
      isInstrumental: def.isInstrumental,
      source: "curated",
    });
  }

  return suggestions;
}

export async function getTrendingCombos(): Promise<TrendingCombo[]> {
  return cached(
    TRENDING_CACHE_KEY,
    async () => {
      const cutoff = new Date(
        Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );

      const feedbackWithTags = await prisma.generationFeedback.findMany({
        where: { createdAt: { gte: cutoff } },
        select: {
          rating: true,
          song: { select: { tags: true } },
        },
      });

      const comboStats: Record<string, { likes: number; dislikes: number }> = {};

      for (const fb of feedbackWithTags) {
        const rawTags = fb.song.tags;
        if (!rawTags) continue;

        const tags = rawTags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        if (tags.length === 0) continue;

        const combo = [...tags].sort().join(", ");
        if (!comboStats[combo]) comboStats[combo] = { likes: 0, dislikes: 0 };
        if (fb.rating === "thumbs_up") comboStats[combo].likes++;
        else comboStats[combo].dislikes++;
      }

      return Object.entries(comboStats)
        .map(([combo, { likes, dislikes }]) => {
          const total = likes + dislikes;
          const likeRatio = total > 0 ? likes / total : 0;
          return { combo, likes, dislikes, total, likeRatio };
        })
        .filter(({ total }) => total >= MIN_FEEDBACK_THRESHOLD)
        .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
        .slice(0, MAX_TRENDING)
        .map(({ combo, likes, total, likeRatio }) => ({
          id: makeId("trending", combo),
          combo,
          label: makeLabelFromParts(combo, " + "),
          stylePrompt: combo,
          likes,
          total,
          score: Math.round(likeRatio * 10) / 10,
          displayScore: `${(likeRatio * 5).toFixed(1)}/5`,
        }));
    },
    CacheTTL.RECOMMENDATIONS,
  );
}
