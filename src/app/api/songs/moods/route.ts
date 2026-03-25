import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";

// Simple in-memory IP rate limiter
const ipHits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Common mood/vibe descriptors used in Suno-style prompts
const MOOD_KEYWORDS = new Set([
  "energetic", "chill", "dark", "uplifting", "melancholic", "aggressive",
  "relaxed", "happy", "sad", "epic", "dreamy", "intense", "romantic",
  "mysterious", "peaceful", "angry", "nostalgic", "euphoric", "somber",
  "atmospheric", "hypnotic", "groovy", "emotional", "powerful", "calm",
]);

const FALLBACK_MOODS = [
  "Energetic", "Chill", "Dark", "Uplifting", "Melancholic",
  "Dreamy", "Epic", "Relaxed", "Happy", "Romantic",
];

/**
 * GET /api/songs/moods
 *
 * Returns the top 10 most-used mood tags from public songs.
 * Falls back to the default list when no data exists.
 *
 * Response: { moods: { name: string; count: number }[] }
 */
export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const key = cacheKey("moods", "top10");
    const moods = await cached(
      key,
      async () => {
        const rows = await prisma.song.findMany({
          where: {
            isPublic: true,
            isHidden: false,
            archivedAt: null,
            generationStatus: "ready",
            tags: { not: null },
          },
          select: { tags: true },
        });

        const counts = new Map<string, number>();
        for (const row of rows) {
          if (!row.tags) continue;
          const parts = row.tags
            .split(/[,;\s]+/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
          for (const part of parts) {
            if (MOOD_KEYWORDS.has(part)) {
              counts.set(part, (counts.get(part) ?? 0) + 1);
            }
          }
        }

        if (counts.size === 0) {
          return FALLBACK_MOODS.map((name) => ({ name, count: 0 }));
        }

        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            count,
          }));
      },
      CacheTTL.DISCOVER
    );

    return NextResponse.json(
      { moods },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch (error) {
    logServerError("songs-moods", error, { route: "/api/songs/moods" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
