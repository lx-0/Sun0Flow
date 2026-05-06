import { Prisma } from "@prisma/client";
import type { Song, SongTag, Tag, Favorite } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

// ---------------------------------------------------------------------------
// Filters — reusable Prisma WHERE-clause builders
// ---------------------------------------------------------------------------

export const SongFilters = {
  userLibrary(userId: string): Prisma.SongWhereInput {
    return {
      userId,
      parentSongId: null,
      archivedAt: null,
    };
  },

  userArchived(userId: string): Prisma.SongWhereInput {
    return {
      userId,
      parentSongId: null,
      archivedAt: { not: null },
    };
  },

  publicDiscovery(): Prisma.SongWhereInput {
    return {
      isPublic: true,
      isHidden: false,
      archivedAt: null,
      generationStatus: "ready",
    };
  },

  variantFamily(rootId: string): Prisma.SongWhereInput {
    return {
      OR: [{ id: rootId }, { parentSongId: rootId }],
      generationStatus: "ready",
      archivedAt: null,
      isHidden: false,
    };
  },

  ownedBy(userId: string, songId: string): Prisma.SongWhereInput {
    return { id: songId, userId };
  },

  ready(): Prisma.SongWhereInput {
    return { generationStatus: "ready" };
  },

  withTagContains(
    base: Prisma.SongWhereInput,
    values: string[]
  ): Prisma.SongWhereInput {
    if (values.length === 0) return base;
    const conditions = values.map((v) => ({
      tags: { contains: v, mode: "insensitive" as const },
    }));
    return {
      ...base,
      AND: [
        ...((base.AND as Prisma.SongWhereInput[]) ?? []),
        { OR: conditions },
      ],
    };
  },

  withSongTags(
    base: Prisma.SongWhereInput,
    tagIds: string[]
  ): Prisma.SongWhereInput {
    if (tagIds.length === 0) return base;
    if (tagIds.length === 1) {
      return { ...base, songTags: { some: { tagId: tagIds[0] } } };
    }
    return {
      ...base,
      AND: [
        ...((base.AND as Prisma.SongWhereInput[]) ?? []),
        ...tagIds.map((tid) => ({ songTags: { some: { tagId: tid } } })),
      ],
    };
  },

  withTagFilters(
    base: Prisma.SongWhereInput,
    genre?: string,
    mood?: string
  ): Prisma.SongWhereInput {
    if (!genre && !mood) return base;
    if (genre && mood) {
      return {
        ...base,
        AND: [
          ...((base.AND as Prisma.SongWhereInput[]) ?? []),
          { tags: { contains: genre, mode: "insensitive" } },
          { tags: { contains: mood, mode: "insensitive" } },
        ],
      };
    }
    return {
      ...base,
      tags: { contains: (genre || mood)!, mode: "insensitive" },
    };
  },

  discoverable(): Prisma.SongWhereInput {
    return {
      generationStatus: "ready",
      audioUrl: { not: null },
      archivedAt: null,
    };
  },

  withTempoRange(
    base: Prisma.SongWhereInput,
    tempoMin?: number,
    tempoMax?: number
  ): Prisma.SongWhereInput {
    if (!tempoMin && !tempoMax) return base;
    const tempo: Prisma.IntNullableFilter = {};
    if (tempoMin) tempo.gte = tempoMin;
    if (tempoMax) tempo.lte = tempoMax;
    return { ...base, tempo };
  },

  withExcludeIds(
    base: Prisma.SongWhereInput,
    ids: string[]
  ): Prisma.SongWhereInput {
    if (ids.length === 0) return base;
    return { ...base, id: { notIn: ids } };
  },
} as const;

// ---------------------------------------------------------------------------
// Projections — Prisma include/select shapes
// ---------------------------------------------------------------------------

export const SongSelect = {
  public: {
    id: true,
    userId: true,
    title: true,
    tags: true,
    imageUrl: true,
    audioUrl: true,
    duration: true,
    rating: true,
    playCount: true,
    downloadCount: true,
    publicSlug: true,
    createdAt: true,
    user: { select: { id: true, name: true, username: true } },
  } satisfies Prisma.SongSelect,

  variant: {
    id: true,
    title: true,
    audioUrl: true,
    imageUrl: true,
    duration: true,
    tags: true,
    publicSlug: true,
    createdAt: true,
  } satisfies Prisma.SongSelect,
} as const;

const SongInclude = {
  detail(userId: string) {
    return {
      songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      favorites: { where: { userId }, select: { id: true } },
      _count: { select: { favorites: true, variations: true } },
    } satisfies Prisma.SongInclude;
  },

  detailWithoutVariations(userId: string) {
    return {
      songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      favorites: { where: { userId }, select: { id: true } },
      _count: { select: { favorites: true } },
    } satisfies Prisma.SongInclude;
  },
} as const;

// ---------------------------------------------------------------------------
// Enrichment — transforms Prisma rows into the public EnrichedSong shape
// ---------------------------------------------------------------------------

type SongTagWithTag = SongTag & { tag: Tag };

type SongWithDetail = Song & {
  songTags: SongTagWithTag[];
  favorites: Pick<Favorite, "id">[];
  _count: { favorites: number; variations?: number };
};

export type EnrichedSong = Omit<Song, never> & {
  songTags: SongTagWithTag[];
  isFavorite: boolean;
  favoriteCount: number;
  variationCount: number;
};

function enrichSong(song: SongWithDetail): EnrichedSong {
  const { favorites, _count, ...rest } = song;
  return {
    ...rest,
    isFavorite: favorites.length > 0,
    favoriteCount: _count.favorites,
    variationCount: _count.variations ?? 0,
  };
}

function enrichSongs(songs: SongWithDetail[]): EnrichedSong[] {
  return songs.map(enrichSong);
}

// ---------------------------------------------------------------------------
// Cursor pagination
// ---------------------------------------------------------------------------

function cursorPaginate<T extends { id: string }>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;
  return { items, nextCursor };
}

// ---------------------------------------------------------------------------
// Song library query — the main entry point for listing/searching songs
// ---------------------------------------------------------------------------

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
  where = SongFilters.withTempoRange(
    where,
    tempoMin !== undefined && tempoMin > 0 ? tempoMin : undefined,
    tempoMax !== undefined && tempoMax > 0 ? tempoMax : undefined,
  );

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

// ---------------------------------------------------------------------------
// Single-song finders
// ---------------------------------------------------------------------------

export interface PublicVariant {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
  createdAt: Date;
}

export async function getVariantFamily(
  songId: string,
  parentSongId: string | null
): Promise<PublicVariant[]> {
  let rootId = songId;

  if (parentSongId) {
    rootId = parentSongId;
    let current = await prisma.song.findUnique({
      where: { id: rootId },
      select: { parentSongId: true },
    });
    while (current?.parentSongId) {
      rootId = current.parentSongId;
      current = await prisma.song.findUnique({
        where: { id: rootId },
        select: { parentSongId: true },
      });
    }
  }

  return prisma.song.findMany({
    where: SongFilters.variantFamily(rootId),
    select: SongSelect.variant,
    orderBy: { createdAt: "asc" },
  });
}

export async function findUserSong(
  userId: string,
  songId: string
): Promise<EnrichedSong | null> {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
    include: SongInclude.detailWithoutVariations(userId),
  });
  if (!song) return null;
  return enrichSong(song as SongWithDetail);
}
