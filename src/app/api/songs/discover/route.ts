import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

export async function GET(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "discover", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const params = request.nextUrl.searchParams;

    // Pagination (offset-based, 20 per page)
    const pageParam = parseInt(params.get("page") || "", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    // Sorting
    const sortBy = params.get("sortBy") || "newest";

    // Genre tag filter
    const tag = params.get("tag")?.trim() || "";
    // Mood filter
    const mood = params.get("mood")?.trim() || "";
    // Tempo range filters
    const tempoMinParam = params.get("tempoMin");
    const tempoMaxParam = params.get("tempoMax");
    const tempoMin =
      tempoMinParam && !isNaN(parseInt(tempoMinParam, 10))
        ? parseInt(tempoMinParam, 10)
        : null;
    const tempoMax =
      tempoMaxParam && !isNaN(parseInt(tempoMaxParam, 10))
        ? parseInt(tempoMaxParam, 10)
        : null;

    // Base WHERE: public, not hidden, not archived, generation complete
    const where: Prisma.SongWhereInput = {
      isPublic: true,
      isHidden: false,
      archivedAt: null,
      generationStatus: "ready",
    };

    // Filter by genre tag (match against the tags text field, case-insensitive)
    if (tag) {
      where.tags = { contains: tag, mode: "insensitive" };
    }

    // Filter by mood (also matched against the tags text field)
    if (mood && !tag) {
      where.tags = { contains: mood, mode: "insensitive" };
    } else if (mood && tag) {
      // Both filters: use AND
      where.AND = [
        { tags: { contains: tag, mode: "insensitive" } },
        { tags: { contains: mood, mode: "insensitive" } },
      ];
      delete where.tags;
    }

    // Filter by tempo range
    if (tempoMin !== null || tempoMax !== null) {
      where.tempo = {};
      if (tempoMin !== null) where.tempo.gte = tempoMin;
      if (tempoMax !== null) where.tempo.lte = tempoMax;
    }

    // Build ORDER BY
    let orderBy: Prisma.SongOrderByWithRelationInput;
    switch (sortBy) {
      case "highest_rated":
        orderBy = { rating: { sort: "desc", nulls: "last" } };
        break;
      case "most_played":
        orderBy = { playCount: "desc" };
        break;
      case "newest":
      default:
        orderBy = { createdAt: "desc" };
        break;
    }

    const key = cacheKey(
      "discover",
      sortBy,
      tag || "all",
      mood || "any",
      tempoMin !== null ? String(tempoMin) : "0",
      tempoMax !== null ? String(tempoMax) : "999",
      String(page)
    );
    const { songs, total } = await cached(
      key,
      async () => {
        const [results, count] = await Promise.all([
          prisma.song.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: {
              id: true,
              title: true,
              tags: true,
              imageUrl: true,
              audioUrl: true,
              duration: true,
              rating: true,
              playCount: true,
              publicSlug: true,
              createdAt: true,
              user: { select: { id: true, name: true, username: true } },
            },
          }),
          prisma.song.count({ where }),
        ]);
        return { songs: results, total: count };
      },
      CacheTTL.DISCOVER
    );

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        songs,
        pagination: {
          page,
          totalPages,
          total,
          hasMore: page < totalPages,
        },
      },
      {
        headers: { "Cache-Control": CacheControl.publicShort },
      }
    );
  } catch (error) {
    logServerError("songs-discover", error, { route: "/api/songs/discover" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
