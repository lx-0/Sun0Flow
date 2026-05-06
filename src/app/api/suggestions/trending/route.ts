import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, CacheControl, CacheTTL } from "@/lib/cache";

const TRENDING_TTL = CacheTTL.RECOMMENDATIONS; // 1h — trending combos change slowly
const TRENDING_CACHE_KEY = "trending-combos:v1";
const MAX_TRENDING = 5;

function makeLabelFromCombo(combo: string): string {
  const parts = combo.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 3).join(" + ");
}

function makeId(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `trending-${Math.abs(hash).toString(16).slice(0, 8)}`;
}

// GET /api/suggestions/trending — top-performing prompt combos platform-wide (last 30d)
export async function GET(request: Request) {
  try {
    const { error: authError } = await resolveUser(request);
    if (authError) return authError;

    const trending = await cached(
      TRENDING_CACHE_KEY,
      async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const feedbackWithTags = await prisma.generationFeedback.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
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
          .filter(({ total }) => total >= 3) // min feedback threshold
          .sort((a, b) => b.likeRatio - a.likeRatio || b.total - a.total)
          .slice(0, MAX_TRENDING)
          .map(({ combo, likes, total, likeRatio }) => ({
            id: makeId(combo),
            combo,
            label: makeLabelFromCombo(combo),
            stylePrompt: combo,
            likes,
            total,
            score: Math.round(likeRatio * 10) / 10, // 0.0–1.0
            displayScore: `${(likeRatio * 5).toFixed(1)}/5`, // "4.8/5"
          }));
      },
      TRENDING_TTL
    );

    const response = NextResponse.json({ trending });
    response.headers.set("Cache-Control", CacheControl.privateShort);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
