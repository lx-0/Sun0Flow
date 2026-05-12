import { Prisma } from "@prisma/client";

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
// Discoverable filter — composes SongFilters into a single query predicate
// ---------------------------------------------------------------------------

export interface DiscoverableFilterOptions {
  visibility?: "public" | "discoverable";
  genre?: string;
  mood?: string;
  tags?: string[];
  tagIds?: string[];
  tempoMin?: number;
  tempoMax?: number;
  excludeIds?: string[];
}

export function buildDiscoverableFilter(
  options: DiscoverableFilterOptions = {},
): Prisma.SongWhereInput {
  const { visibility = "public", genre, mood, tags, tagIds, tempoMin, tempoMax, excludeIds } = options;

  let where: Prisma.SongWhereInput =
    visibility === "discoverable"
      ? SongFilters.discoverable()
      : SongFilters.publicDiscovery();

  where = SongFilters.withTagFilters(where, genre, mood);
  where = SongFilters.withTagContains(where, tags ?? []);
  where = SongFilters.withSongTags(where, tagIds ?? []);
  where = SongFilters.withTempoRange(where, tempoMin, tempoMax);
  where = SongFilters.withExcludeIds(where, excludeIds ?? []);

  return where;
}
