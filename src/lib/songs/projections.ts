import { Prisma } from "@prisma/client";
import type { Song, SongTag, Tag, Favorite } from "@prisma/client";

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

// ---------------------------------------------------------------------------
// Enrichment — transforms Prisma rows into the public EnrichedSong shape
// ---------------------------------------------------------------------------

type SongTagWithTag = SongTag & { tag: Tag };

export type SongWithDetail = Song & {
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

export function enrichSong(song: SongWithDetail): EnrichedSong {
  const { favorites, _count, ...rest } = song;
  return {
    ...rest,
    isFavorite: favorites.length > 0,
    favoriteCount: _count.favorites,
    variationCount: _count.variations ?? 0,
  };
}

export function enrichSongs(songs: SongWithDetail[]): EnrichedSong[] {
  return songs.map(enrichSong);
}
