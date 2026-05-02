import { Prisma } from "@prisma/client";

export const SongInclude = {
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
