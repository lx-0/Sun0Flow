import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { internalError } from "@/lib/api-error";

/**
 * Convert a user search query into a websearch_to_tsquery-compatible expression.
 * Returns null if the query is empty or too short for FTS.
 */
function buildTsQuery(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length < 3) return null;
  return trimmed;
}

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim() || "";
    const status = params.get("status") || "";
    const minRating = parseInt(params.get("minRating") || "", 10);
    const sortBy = params.get("sortBy") || "newest";
    const sortDir = params.get("sortDir") || "";
    const dateFrom = params.get("dateFrom") || "";
    const dateTo = params.get("dateTo") || "";
    const tagId = params.get("tagId") || "";
    // Multi-tag filter: tagIds=id1,id2 (AND logic — song must have ALL tags)
    const tagIdsParam = params.get("tagIds") || "";
    const tagIds = tagIdsParam ? tagIdsParam.split(",").map((t) => t.trim()).filter(Boolean) : tagId ? [tagId] : [];
    const smartFilter = params.get("smartFilter") || "";
    const includeVariations = params.get("includeVariations") === "true";
    const showArchived = params.get("archived") === "true";
    // Advanced filters: genre, mood (tag-based ILIKE), tempo range
    const genreParam = params.get("genre") || "";
    const moodParam = params.get("mood") || "";
    const tempoMinParam = parseInt(params.get("tempoMin") || "", 10);
    const tempoMaxParam = parseInt(params.get("tempoMax") || "", 10);

    // Mark stale pending songs as failed (fire-and-forget, don't block the response)
    // A song is stale if it's been pending for more than 15 minutes (well beyond 60 poll × 4s = 240s max)
    const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
    prisma.song.updateMany({
      where: {
        userId,
        generationStatus: "pending",
        updatedAt: { lt: staleThreshold },
      },
      data: {
        generationStatus: "failed",
        errorMessage: "Generation timed out",
      },
    }).catch((err) => {
      logServerError("songs-stale-cleanup", err, { userId, route: "/api/songs" });
    });

    // Pagination
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const cursor = params.get("cursor") || "";

    // ── Full-text search path (q >= 3 chars) ──────────────────────────────────
    const tsQuery = buildTsQuery(q);

    // When FTS is active, get ranked song IDs from PostgreSQL first.
    let ftsRankedIds: string[] | null = null;
    if (tsQuery) {
      try {
        const rows = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM "Song"
          WHERE "userId" = ${userId}
            AND "searchVector" @@ websearch_to_tsquery('english', ${tsQuery})
          ORDER BY ts_rank("searchVector", websearch_to_tsquery('english', ${tsQuery})) DESC
        `;
        ftsRankedIds = rows.map((r) => r.id);
      } catch {
        // FTS unavailable (e.g. migration not applied yet) — fall back to ILIKE
        ftsRankedIds = null;
      }
    }

    // Build WHERE conditions — exclude child songs (alternates) by default
    const where: Prisma.SongWhereInput = {
      userId: userId,
      ...(includeVariations ? {} : { parentSongId: null }),
      // By default exclude archived songs; when archived=true, show only archived
      ...(showArchived ? { archivedAt: { not: null } } : { archivedAt: null }),
    };

    if (ftsRankedIds !== null) {
      // FTS: filter to ranked IDs; other Prisma filters still apply
      where.id = { in: ftsRankedIds };
    } else if (q) {
      // Short query or FTS unavailable — fall back to ILIKE
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { prompt: { contains: q, mode: "insensitive" } },
        { lyrics: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
        { songTags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      ];
    }

    // Status filter
    if (status && ["ready", "pending", "failed"].includes(status)) {
      where.generationStatus = status;
    }

    // Rating filter (min stars)
    if (!isNaN(minRating) && minRating >= 1 && minRating <= 5) {
      where.rating = { gte: minRating };
    }

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) {
          (where.createdAt as Prisma.DateTimeFilter).gte = from;
        }
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          // Include the entire "dateTo" day
          to.setHours(23, 59, 59, 999);
          (where.createdAt as Prisma.DateTimeFilter).lte = to;
        }
      }
    }

    // Tag filter (AND logic: song must have ALL selected tags)
    if (tagIds.length === 1) {
      where.songTags = { some: { tagId: tagIds[0] } };
    } else if (tagIds.length > 1) {
      where.AND = [
        ...((where.AND as Prisma.SongWhereInput[]) ?? []),
        ...tagIds.map((tid) => ({ songTags: { some: { tagId: tid } } })),
      ];
    }

    // Genre filter (multi-value, ILIKE on tags field)
    const genres = genreParam ? genreParam.split(",").map((g) => g.trim()).filter(Boolean) : [];
    if (genres.length > 0) {
      const genreConditions = genres.map((g) => ({ tags: { contains: g, mode: "insensitive" as const } }));
      where.AND = [...((where.AND as Prisma.SongWhereInput[]) ?? []), { OR: genreConditions }];
    }

    // Mood filter (multi-value, ILIKE on tags field)
    const moods = moodParam ? moodParam.split(",").map((m) => m.trim()).filter(Boolean) : [];
    if (moods.length > 0) {
      const moodConditions = moods.map((m) => ({ tags: { contains: m, mode: "insensitive" as const } }));
      where.AND = [...((where.AND as Prisma.SongWhereInput[]) ?? []), { OR: moodConditions }];
    }

    // Tempo range filter
    if (!isNaN(tempoMinParam) && tempoMinParam > 0 || !isNaN(tempoMaxParam) && tempoMaxParam > 0) {
      const tempoFilter: Prisma.IntNullableFilter = {};
      if (!isNaN(tempoMinParam) && tempoMinParam > 0) tempoFilter.gte = tempoMinParam;
      if (!isNaN(tempoMaxParam) && tempoMaxParam > 0) tempoFilter.lte = tempoMaxParam;
      where.tempo = tempoFilter;
    }

    // Smart filters
    if (smartFilter === "this_week") {
      const now = new Date();
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), gte: weekAgo };
    } else if (smartFilter === "unrated") {
      where.rating = null;
    } else if (smartFilter === "most_played") {
      where.playCount = { gt: 0 };
    } else if (smartFilter === "favorites") {
      where.favorites = { some: { userId: userId } };
    }

    // Build ORDER BY — FTS results are re-sorted by rank after fetch
    let orderBy: Prisma.SongOrderByWithRelationInput;
    if (ftsRankedIds !== null) {
      // Rank order is applied post-fetch; use createdAt as stable secondary sort
      orderBy = { createdAt: "desc" };
    } else {
      switch (sortBy) {
        case "oldest":
          orderBy = { createdAt: "asc" };
          break;
        case "highest_rated":
          orderBy = { rating: { sort: "desc", nulls: "last" } };
          break;
        case "most_played":
          orderBy = { playCount: "desc" };
          break;
        case "recently_modified":
          orderBy = { updatedAt: "desc" };
          break;
        case "title_az":
          orderBy = { title: { sort: sortDir === "desc" ? "desc" : "asc", nulls: "last" } };
          break;
        case "newest":
        default:
          orderBy = { createdAt: "desc" };
          break;
      }
    }

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        orderBy,
        take: limit + 1, // fetch one extra to detect next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          favorites: { where: { userId: userId }, select: { id: true } },
          _count: { select: { favorites: true, variations: true } },
        },
      }),
      prisma.song.count({ where }),
    ]);

    const hasMore = songs.length > limit;
    const sliced = hasMore ? songs.slice(0, limit) : songs;
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null;

    const enriched = sliced.map((s) => {
      const { favorites, _count, ...rest } = s;
      return {
        ...rest,
        isFavorite: favorites.length > 0,
        favoriteCount: _count.favorites,
        variationCount: _count.variations,
      };
    });

    // Re-sort by FTS rank order when applicable
    if (ftsRankedIds !== null && ftsRankedIds.length > 0) {
      const rankOrder = new Map(ftsRankedIds.map((id, i) => [id, i]));
      enriched.sort((a, b) => (rankOrder.get(a.id) ?? 9999) - (rankOrder.get(b.id) ?? 9999));
    }

    return NextResponse.json({ songs: enriched, nextCursor, total }, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  } catch (error) {
    logServerError("songs-list", error, { route: "/api/songs" });
    return internalError();
  }
}
