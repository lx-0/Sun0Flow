import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { SongFilters } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

const FALLBACK_GENRES = [
  "Pop", "Rock", "Hip-Hop", "Electronic", "Jazz",
  "Classical", "R&B", "Country", "Lo-Fi", "Ambient",
  "Metal", "Folk", "Indie", "Funk", "Soul",
];

/**
 * GET /api/songs/genres
 *
 * Returns the top 15 most-used genre tags from public songs, sorted by frequency.
 * Falls back to the default hardcoded list when no songs exist.
 *
 * Response: { genres: { name: string; count: number }[] }
 */
export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "genres", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const key = cacheKey("genres", "top15");
    const genres = await cached(
      key,
      async () => {
        // Fetch all non-null tags fields from public, non-hidden, ready songs
        const rows = await prisma.song.findMany({
          where: { ...SongFilters.publicDiscovery(), tags: { not: null } },
          select: { tags: true },
        });

        // Count individual genre tokens (tags field is a comma- or space-separated string)
        const counts = new Map<string, number>();
        for (const row of rows) {
          if (!row.tags) continue;
          // Split on commas or semicolons, trim whitespace
          const parts = row.tags.split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
          for (const part of parts) {
            const key = part.toLowerCase();
            // Store display name as the first-seen casing for each lowercase key
            if (!counts.has(key)) counts.set(key, 0);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }

        if (counts.size === 0) {
          // No public songs yet — return fallback list with count 0
          return FALLBACK_GENRES.map((name) => ({ name, count: 0 }));
        }

        // Sort by frequency desc, take top 15
        const sorted = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([name, count]) => ({
            // Capitalize first letter for display consistency
            name: name.charAt(0).toUpperCase() + name.slice(1),
            count,
          }));

        return sorted;
      },
      CacheTTL.DISCOVER
    );

    return NextResponse.json(
      { genres },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch (error) {
    logServerError("songs-genres", error, { route: "/api/songs/genres" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
