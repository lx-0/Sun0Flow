export interface BaseSongResult {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
}

export type BaseSongRow = {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: Date;
};

export const BASE_SONG_SELECT = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  duration: true,
  audioUrl: true,
  createdAt: true,
} as const;

export function formatBaseSong(s: BaseSongRow): BaseSongResult {
  return {
    id: s.id,
    title: s.title,
    tags: s.tags,
    imageUrl: s.imageUrl,
    duration: s.duration,
    audioUrl: s.audioUrl,
    createdAt: s.createdAt.toISOString(),
  };
}

export interface RecommendedSong extends BaseSongResult {
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
}

export type SongRow = BaseSongRow & {
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
};

export const SONG_SELECT_FIELDS = {
  ...BASE_SONG_SELECT,
  rating: true,
  playCount: true,
  isFavorite: true,
} as const;

export function formatSong(s: SongRow): RecommendedSong {
  return {
    ...formatBaseSong(s),
    rating: s.rating,
    playCount: s.playCount,
    isFavorite: s.isFavorite,
  };
}

export interface RecommendationResult {
  songs: RecommendedSong[];
  total: number;
  strategy: "embedding_similarity" | "cold_start" | "fallback_no_candidates" | "daily_mix";
  generatedAt: string;
}
