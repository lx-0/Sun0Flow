import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_SUGGESTIONS = 5;

// Curated defaults for new users with no history
const CURATED_DEFAULTS: Array<{ stylePrompt: string; isInstrumental: boolean }> = [
  { stylePrompt: "pop, upbeat, catchy, female vocals", isInstrumental: false },
  { stylePrompt: "lo-fi hip hop, chill, relaxing, jazzy", isInstrumental: true },
  { stylePrompt: "epic orchestral, cinematic, dramatic", isInstrumental: true },
  { stylePrompt: "indie folk, acoustic, heartfelt, singer-songwriter", isInstrumental: false },
  { stylePrompt: "electronic, synth, 80s retro, danceable", isInstrumental: false },
];

function normalizeTags(tags: string): string {
  return tags.toLowerCase().trim();
}

function makeLabelFromStyle(stylePrompt: string): string {
  const parts = stylePrompt
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3).join(", ");
}

function makeId(prefix: string, key: string): string {
  // Simple deterministic id from key
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(16).slice(0, 8)}`;
}

// GET /api/suggestions/prompts — ranked prompt suggestions for the current user
export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const suggestions: Array<{
      id: string;
      label: string;
      stylePrompt: string;
      isInstrumental: boolean;
      source: "personal" | "community" | "curated";
    }> = [];

    const seen = new Set<string>();

    // 1. Personal: user's highly-rated songs' style (tags) prompts
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

    // Group by normalized tags and count frequency
    const personalCounts = new Map<
      string,
      { stylePrompt: string; isInstrumental: boolean; count: number }
    >();
    for (const song of personalSongs) {
      if (!song.tags?.trim()) continue;
      const key = normalizeTags(song.tags);
      const existing = personalCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        personalCounts.set(key, {
          stylePrompt: song.tags.trim(),
          isInstrumental: song.isInstrumental,
          count: 1,
        });
      }
    }

    const sortedPersonal = Array.from(personalCounts.values()).sort(
      (a, b) => b.count - a.count
    );
    for (const entry of sortedPersonal) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const key = normalizeTags(entry.stylePrompt);
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          id: makeId("personal", key),
          label: makeLabelFromStyle(entry.stylePrompt),
          stylePrompt: entry.stylePrompt,
          isInstrumental: entry.isInstrumental,
          source: "personal",
        });
      }
    }

    // 2. Community: globally popular style prompts from public highly-rated songs
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

      const communityCounts = new Map<
        string,
        { stylePrompt: string; isInstrumental: boolean; count: number }
      >();
      for (const song of communitySongs) {
        if (!song.tags?.trim()) continue;
        const key = normalizeTags(song.tags);
        const existing = communityCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          communityCounts.set(key, {
            stylePrompt: song.tags.trim(),
            isInstrumental: song.isInstrumental,
            count: 1,
          });
        }
      }

      const sortedCommunity = Array.from(communityCounts.values()).sort(
        (a, b) => b.count - a.count
      );
      for (const entry of sortedCommunity) {
        if (suggestions.length >= MAX_SUGGESTIONS) break;
        const key = normalizeTags(entry.stylePrompt);
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push({
            id: makeId("community", key),
            label: makeLabelFromStyle(entry.stylePrompt),
            stylePrompt: entry.stylePrompt,
            isInstrumental: entry.isInstrumental,
            source: "community",
          });
        }
      }
    }

    // 3. Curated defaults — fill remaining slots
    for (const def of CURATED_DEFAULTS) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const key = normalizeTags(def.stylePrompt);
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          id: makeId("curated", key),
          label: makeLabelFromStyle(def.stylePrompt),
          stylePrompt: def.stylePrompt,
          isInstrumental: def.isInstrumental,
          source: "curated",
        });
      }
    }

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
