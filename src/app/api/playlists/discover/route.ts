import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { rateLimited, internalError } from "@/lib/api-error";
import { withTiming } from "@/lib/timing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { trendingScore } from "@/lib/scoring";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

/**
 * GET /api/playlists/discover
 *
 * Browse published playlists with filtering and sorting.
 *
 * Query params:
 *   genre  — filter by genre string (case-insensitive)
 *   sort   — "trending" (default) | "recent" | "popular"
 *   page   — page number >= 1 (default 1)
 *   limit  — 1–100 (default 20)
 */
async function handleGET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "playlist-discover", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;

    // Pagination
    const pageParam = parseInt(params.get("page") || "", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const skip = (page - 1) * limit;

    // Sorting
    const sortParam = params.get("sort") || "trending";
    const sort = ["trending", "recent", "popular"].includes(sortParam) ? sortParam : "trending";

    // Genre filter
    const genre = params.get("genre")?.trim() || "";

    // Base WHERE: only published playlists
    const baseWhere: Prisma.PlaylistWhereInput = {
      isPublished: true,
    };

    if (genre) {
      baseWhere.genre = { contains: genre, mode: "insensitive" };
    }

    const key = cacheKey(
      "playlist-discover-v1",
      sort,
      genre || "any",
      String(page),
      String(limit)
    );

    const select = {
      id: true,
      name: true,
      description: true,
      genre: true,
      slug: true,
      publishedAt: true,
      playCount: true,
      shareCount: true,
      createdAt: true,
      user: { select: { id: true, name: true, username: true } },
      _count: { select: { songs: true } },
    } as const;

    const result = await cached(
      key,
      async () => {
        if (sort === "trending") {
          // Trending: fetch candidate pool from last 30 days, score in JS
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const trendingWhere: Prisma.PlaylistWhereInput = {
            ...baseWhere,
            publishedAt: { gte: thirtyDaysAgo },
          };

          const POOL_SIZE = 500;
          const [pool, total] = await Promise.all([
            prisma.playlist.findMany({
              where: trendingWhere,
              orderBy: { playCount: "desc" },
              take: POOL_SIZE,
              select,
            }),
            prisma.playlist.count({ where: trendingWhere }),
          ]);

          const scored = pool
            .map((p) => ({
              ...formatPlaylist(p),
              score: trendingScore(p.playCount, p.shareCount, p.publishedAt!),
            }))
            .sort((a, b) => b.score - a.score);

          return {
            playlists: scored.slice(skip, skip + limit),
            total,
          };
        }

        // recent or popular — use DB ordering
        let orderBy: Prisma.PlaylistOrderByWithRelationInput;
        if (sort === "popular") {
          orderBy = { playCount: "desc" };
        } else {
          orderBy = { publishedAt: "desc" };
        }

        const [playlists, total] = await Promise.all([
          prisma.playlist.findMany({
            where: baseWhere,
            orderBy,
            skip,
            take: limit,
            select,
          }),
          prisma.playlist.count({ where: baseWhere }),
        ]);

        return {
          playlists: playlists.map((p) => formatPlaylist(p)),
          total,
        };
      },
      CacheTTL.DISCOVER
    );

    const totalPages = Math.ceil(result.total / limit);

    return NextResponse.json(
      {
        playlists: result.playlists,
        sort,
        pagination: {
          page,
          limit,
          totalPages,
          total: result.total,
          hasMore: page < totalPages,
        },
      },
      {
        headers: { "Cache-Control": CacheControl.publicShort },
      }
    );
  } catch (error) {
    logServerError("playlists-discover", error, { route: "/api/playlists/discover" });
    return internalError();
  }
}

function formatPlaylist(p: {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  slug: string | null;
  publishedAt: Date | null;
  playCount: number;
  shareCount: number;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null };
  _count: { songs: number };
}) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    genre: p.genre,
    slug: p.slug,
    songCount: p._count.songs,
    publishedAt: p.publishedAt,
    playCount: p.playCount,
    createdAt: p.createdAt,
    creatorDisplayName: p.user.name || p.user.username || "Anonymous",
    creatorUsername: p.user.username || null,
  };
}

export const GET = withTiming("/api/playlists/discover", handleGET);
