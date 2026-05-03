import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { SongFilters } from "./filters";
import { SongInclude } from "./projections";
import { cursorPaginate } from "./paginate";
import { enrichSongs, type SongWithDetail, type EnrichedSong } from "./enrich";

export type SortField =
  | "newest"
  | "oldest"
  | "highest_rated"
  | "most_played"
  | "recently_modified"
  | "title_az";

export interface SongLibraryQuery {
  userId: string;
  search?: string;
  status?: string;
  minRating?: number;
  sortBy?: SortField;
  sortDir?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
  tagIds?: string[];
  genres?: string[];
  moods?: string[];
  tempoMin?: number;
  tempoMax?: number;
  smartFilter?: string;
  includeVariations?: boolean;
  archived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SongLibraryResult {
  songs: EnrichedSong[];
  nextCursor: string | null;
  total: number;
}

function buildFtsQuery(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length < 3) return null;
  return trimmed;
}

function buildOrderBy(
  sortBy: SortField,
  sortDir: string | undefined,
  hasFts: boolean
): Prisma.SongOrderByWithRelationInput {
  if (hasFts) return { createdAt: "desc" };

  switch (sortBy) {
    case "oldest":
      return { createdAt: "asc" };
    case "highest_rated":
      return { rating: { sort: "desc", nulls: "last" } };
    case "most_played":
      return { playCount: "desc" };
    case "recently_modified":
      return { updatedAt: "desc" };
    case "title_az":
      return { title: { sort: sortDir === "desc" ? "desc" : "asc", nulls: "last" } };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

export async function querySongLibrary(
  query: SongLibraryQuery
): Promise<SongLibraryResult> {
  const {
    userId,
    search = "",
    status,
    minRating,
    sortBy = "newest",
    sortDir,
    dateFrom,
    dateTo,
    tagIds = [],
    genres = [],
    moods = [],
    tempoMin,
    tempoMax,
    smartFilter,
    includeVariations = false,
    archived = false,
    cursor,
  } = query;

  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

  cleanupStalePending(userId);

  const tsQuery = buildFtsQuery(search);
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

  const base = archived
    ? SongFilters.userArchived(userId)
    : SongFilters.userLibrary(userId);

  let where: Prisma.SongWhereInput = {
    ...base,
    ...(includeVariations ? { parentSongId: undefined } : {}),
  };

  if (ftsRankedIds !== null) {
    where.id = { in: ftsRankedIds };
  } else if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { prompt: { contains: search, mode: "insensitive" } },
      { lyrics: { contains: search, mode: "insensitive" } },
      { tags: { contains: search, mode: "insensitive" } },
      { songTags: { some: { tag: { name: { contains: search, mode: "insensitive" } } } } },
    ];
  }

  if (status && ["ready", "pending", "failed"].includes(status)) {
    where.generationStatus = status;
  }

  if (minRating !== undefined && minRating >= 1 && minRating <= 5) {
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
  where = SongFilters.withTagContains(where, genres);
  where = SongFilters.withTagContains(where, moods);

  if (
    (tempoMin !== undefined && tempoMin > 0) ||
    (tempoMax !== undefined && tempoMax > 0)
  ) {
    const tempoFilter: Prisma.IntNullableFilter = {};
    if (tempoMin !== undefined && tempoMin > 0) tempoFilter.gte = tempoMin;
    if (tempoMax !== undefined && tempoMax > 0) tempoFilter.lte = tempoMax;
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

  const orderBy = buildOrderBy(sortBy, sortDir, ftsRankedIds !== null);

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

  return { songs: enriched, nextCursor, total };
}

function cleanupStalePending(userId: string) {
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
  prisma.song
    .updateMany({
      where: {
        userId,
        generationStatus: "pending",
        updatedAt: { lt: staleThreshold },
      },
      data: {
        generationStatus: "failed",
        errorMessage: "Generation timed out",
      },
    })
    .catch((err) => {
      logServerError("songs-stale-cleanup", err, { userId, route: "/api/songs" });
    });
}
