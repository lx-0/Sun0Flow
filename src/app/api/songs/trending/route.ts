import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { rateLimited, internalError } from "@/lib/api-error";
import { withTiming } from "@/lib/timing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { SongFilters } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * Compute time-decay trending score.
 * score = (playCount + downloadCount * 2) / (1 + age_days * 0.1)
 */
function trendingScore(playCount: number, downloadCount: number, createdAt: Date): number {
  const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return (playCount + downloadCount * 2) / (1 + ageDays * 0.1);
}

/**
 * GET /api/songs/trending
 *
 * Returns public songs ranked by trending or popular score.
 *
 * Query params:
 *   sort    = "trending" (default) | "popular"
 *   limit   = 1–100 (default 20)
 *   offset  = >= 0 (default 0)
 *   genre   = genre tag filter (ILIKE)
 *   mood    = mood tag filter (ILIKE)
 *
 * Trending uses a time-decay formula restricted to songs from the last 30 days:
 *   score = (playCount + downloadCount * 2) / (1 + age_days * 0.1)
 *
 * Popular returns all-time most-played public songs ordered by playCount desc.
 *
 * Rankings are cached for 1 hour.
 */
async function handleGET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "trending", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;

    const sort = params.get("sort") === "popular" ? "popular" : "trending";

    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;

    const offsetParam = parseInt(params.get("offset") || "", 10);
    const offset = !isNaN(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const genre = params.get("genre")?.trim() || "";
    const mood = params.get("mood")?.trim() || "";

    const key = cacheKey(
      "trending-v1",
      sort,
      genre || "any",
      mood || "any",
      String(limit),
      String(offset)
    );

    const result = await cached(
      key,
      async () => {
        const baseWhere = SongFilters.withTagFilters(
          SongFilters.publicDiscovery(),
          genre || undefined,
          mood || undefined
        );

        const select = {
          id: true,
          title: true,
          tags: true,
          imageUrl: true,
          audioUrl: true,
          duration: true,
          playCount: true,
          downloadCount: true,
          publicSlug: true,
          createdAt: true,
          user: { select: { name: true, username: true } },
        } as const;

        if (sort === "popular") {
          const [songs, total] = await Promise.all([
            prisma.song.findMany({
              where: baseWhere,
              orderBy: { playCount: "desc" },
              skip: offset,
              take: limit,
              select,
            }),
            prisma.song.count({ where: baseWhere }),
          ]);

          return {
            songs: songs.map((s) => ({
              id: s.id,
              title: s.title,
              genre: s.tags || null,
              albumArtUrl: s.imageUrl,
              audioUrl: s.audioUrl,
              duration: s.duration,
              playCount: s.playCount,
              publicSlug: s.publicSlug,
              createdAt: s.createdAt,
              score: s.playCount,
              creatorDisplayName: s.user.name || s.user.username || "Anonymous",
              creatorUsername: s.user.username || null,
            })),
            total,
          };
        }

        // Trending: fetch candidate pool from last 30 days, compute decay score in JS,
        // then paginate. Fetch a pool large enough to rank accurately after offset.
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const trendingWhere = {
          ...baseWhere,
          createdAt: { gte: thirtyDaysAgo },
        };

        // Fetch pool: top 500 by playCount as candidates (sufficient for ranking)
        const POOL_SIZE = 500;
        const [pool, total] = await Promise.all([
          prisma.song.findMany({
            where: trendingWhere,
            orderBy: { playCount: "desc" },
            take: POOL_SIZE,
            select,
          }),
          prisma.song.count({ where: trendingWhere }),
        ]);

        // Compute decay scores and sort
        const scored = pool
          .map((s) => ({
            id: s.id,
            title: s.title,
            genre: s.tags || null,
            albumArtUrl: s.imageUrl,
            audioUrl: s.audioUrl,
            duration: s.duration,
            playCount: s.playCount,
            publicSlug: s.publicSlug,
            createdAt: s.createdAt,
            score: trendingScore(s.playCount, s.downloadCount, s.createdAt),
            creatorDisplayName: s.user.name || s.user.username || "Anonymous",
            creatorUsername: s.user.username || null,
          }))
          .sort((a, b) => b.score - a.score);

        return {
          songs: scored.slice(offset, offset + limit),
          total,
        };
      },
      CacheTTL.RECOMMENDATIONS // 1 hour
    );

    return NextResponse.json(
      {
        songs: result.songs,
        sort,
        pagination: {
          total: result.total,
          limit,
          offset,
          hasMore: offset + limit < result.total,
        },
      },
      {
        headers: { "Cache-Control": CacheControl.publicShort },
      }
    );
  } catch (error) {
    logServerError("songs-trending", error, { route: "/api/songs/trending" });
    return internalError();
  }
}

export const GET = withTiming("/api/songs/trending", handleGET);
