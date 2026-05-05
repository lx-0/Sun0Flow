import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { rateLimited } from "@/lib/api-error";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { SongFilters } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

export async function GET(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "public_songs", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;

    // Pagination (offset-based)
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const offsetParam = parseInt(params.get("offset") || "", 10);
    const offset = !isNaN(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    // Filters
    const q = params.get("q")?.trim() || "";
    const genre = params.get("genre")?.trim() || "";
    const mood = params.get("mood")?.trim() || "";
    const sort = params.get("sort") || "newest";

    const base: Prisma.SongWhereInput = { ...SongFilters.publicDiscovery() };

    if (sort === "trending") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      base.createdAt = { gte: thirtyDaysAgo };
    }

    if (q) {
      base.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
        { lyrics: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { username: { contains: q, mode: "insensitive" } } },
      ];
    }

    const where = SongFilters.withTagFilters(base, genre || undefined, mood || undefined);

    // Build ORDER BY
    let orderBy: Prisma.SongOrderByWithRelationInput;
    switch (sort) {
      case "popular":
        orderBy = { playCount: "desc" };
        break;
      case "trending":
        // Most played within the last 30 days (time window already applied in WHERE)
        orderBy = { playCount: "desc" };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const key = cacheKey(
      "public-songs",
      q || "all",
      genre || "any",
      mood || "any",
      sort,
      String(limit),
      String(offset)
    );

    const { songs, total } = await cached(
      key,
      async () => {
        const [results, count] = await Promise.all([
          prisma.song.findMany({
            where,
            orderBy,
            skip: offset,
            take: limit,
            select: {
              id: true,
              title: true,
              tags: true,
              imageUrl: true,
              audioUrl: true,
              publicSlug: true,
              duration: true,
              playCount: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          }),
          prisma.song.count({ where }),
        ]);
        return { songs: results, total: count };
      },
      CacheTTL.PUBLIC_SONG
    );

    // Shape and optionally sort by relevance when searching
    let shaped = songs.map((s) => ({
      id: s.id,
      title: s.title,
      creatorDisplayName: s.user.name || s.user.username || "Anonymous",
      creatorUserId: s.user.id,
      creatorUsername: s.user.username || null,
      albumArtUrl: s.imageUrl,
      audioUrl: s.audioUrl,
      publicSlug: s.publicSlug,
      duration: s.duration,
      genre: s.tags || null,
      playCount: s.playCount,
      createdAt: s.createdAt,
    }));

    // Re-rank by relevance when a search query is active
    if (q) {
      const ql = q.toLowerCase();
      shaped = shaped.sort((a, b) => {
        const score = (item: typeof a) => {
          if (item.title?.toLowerCase().includes(ql)) return 3;
          if (item.genre?.toLowerCase().includes(ql)) return 2;
          if (item.creatorDisplayName.toLowerCase().includes(ql)) return 2;
          return 1;
        };
        return score(b) - score(a);
      });
    }

    return NextResponse.json(
      {
        songs: shaped,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
      {
        headers: { "Cache-Control": CacheControl.publicShort },
      }
    );
  } catch (error) {
    logServerError("songs-public", error, { route: "/api/songs/public" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
