import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import {
  SongFilters,
  SongInclude,
  enrichSongs,
  cursorPaginate,
  type SongWithDetail,
} from "@/lib/songs";

function buildTsQuery(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length < 3) return null;
  return trimmed;
}

export const GET = authRoute(async (request, { auth }) => {
  const userId = auth.userId;
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || "";
  const status = params.get("status") || "";
  const minRating = parseInt(params.get("minRating") || "", 10);
  const sortBy = params.get("sortBy") || "newest";
  const sortDir = params.get("sortDir") || "";
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const tagId = params.get("tagId") || "";
  const tagIdsParam = params.get("tagIds") || "";
  const tagIds = tagIdsParam ? tagIdsParam.split(",").map((t) => t.trim()).filter(Boolean) : tagId ? [tagId] : [];
  const smartFilter = params.get("smartFilter") || "";
  const includeVariations = params.get("includeVariations") === "true";
  const showArchived = params.get("archived") === "true";
  const genreParam = params.get("genre") || "";
  const moodParam = params.get("mood") || "";
  const tempoMinParam = parseInt(params.get("tempoMin") || "", 10);
  const tempoMaxParam = parseInt(params.get("tempoMax") || "", 10);

  // Fire-and-forget stale cleanup
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

  const limitParam = parseInt(params.get("limit") || "", 10);
  const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
  const cursor = params.get("cursor") || "";

  const tsQuery = buildTsQuery(q);

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
      ftsRankedIds = null;
    }
  }

  const base = showArchived
    ? SongFilters.userArchived(userId)
    : SongFilters.userLibrary(userId);

  let where: Prisma.SongWhereInput = {
    ...base,
    ...(includeVariations ? { parentSongId: undefined } : {}),
  };

  if (ftsRankedIds !== null) {
    where.id = { in: ftsRankedIds };
  } else if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { prompt: { contains: q, mode: "insensitive" } },
      { lyrics: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
      { songTags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
    ];
  }

  if (status && ["ready", "pending", "failed"].includes(status)) {
    where.generationStatus = status;
  }

  if (!isNaN(minRating) && minRating >= 1 && minRating <= 5) {
    where.rating = { gte: minRating };
  }

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
        to.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = to;
      }
    }
  }

  where = SongFilters.withSongTags(where, tagIds);

  const genres = genreParam ? genreParam.split(",").map((g) => g.trim()).filter(Boolean) : [];
  where = SongFilters.withTagContains(where, genres);

  const moods = moodParam ? moodParam.split(",").map((m) => m.trim()).filter(Boolean) : [];
  where = SongFilters.withTagContains(where, moods);

  if (!isNaN(tempoMinParam) && tempoMinParam > 0 || !isNaN(tempoMaxParam) && tempoMaxParam > 0) {
    const tempoFilter: Prisma.IntNullableFilter = {};
    if (!isNaN(tempoMinParam) && tempoMinParam > 0) tempoFilter.gte = tempoMinParam;
    if (!isNaN(tempoMaxParam) && tempoMaxParam > 0) tempoFilter.lte = tempoMaxParam;
    where.tempo = tempoFilter;
  }

  if (smartFilter === "this_week") {
    const now = new Date();
    const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), gte: weekAgo };
  } else if (smartFilter === "unrated") {
    where.rating = null;
  } else if (smartFilter === "most_played") {
    where.playCount = { gt: 0 };
  } else if (smartFilter === "favorites") {
    where.favorites = { some: { userId } };
  }

  let orderBy: Prisma.SongOrderByWithRelationInput;
  if (ftsRankedIds !== null) {
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
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: SongInclude.detail(userId),
    }),
    prisma.song.count({ where }),
  ]);

  const { items, nextCursor } = cursorPaginate(songs as SongWithDetail[], limit);
  const enriched = enrichSongs(items);

  if (ftsRankedIds !== null && ftsRankedIds.length > 0) {
    const rankOrder = new Map(ftsRankedIds.map((id, i) => [id, i]));
    enriched.sort((a, b) => (rankOrder.get(a.id) ?? 9999) - (rankOrder.get(b.id) ?? 9999));
  }

  return NextResponse.json({ songs: enriched, nextCursor, total }, {
    headers: { "Cache-Control": CacheControl.privateNoCache },
  });
}, { route: "/api/songs" });
