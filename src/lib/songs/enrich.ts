import type { Song, SongTag, Tag, Favorite } from "@prisma/client";

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
