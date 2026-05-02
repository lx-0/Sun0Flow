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
} as const;
