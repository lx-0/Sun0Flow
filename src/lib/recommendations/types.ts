export interface RecommendationOptions {
  userId: string;
  limit: number;
  excludeIds: Set<string>;
}

export interface RecommendedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
}

export interface RecommendationResult {
  songs: RecommendedSong[];
  total: number;
  strategy: "embedding_similarity" | "cold_start" | "fallback_no_candidates";
  generatedAt: string;
}

export const SONG_SELECT_FIELDS = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  duration: true,
  audioUrl: true,
  createdAt: true,
  rating: true,
  playCount: true,
  isFavorite: true,
} as const;

export type SongRow = {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: Date;
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
};

export function formatSong(s: SongRow): RecommendedSong {
  return {
    id: s.id,
    title: s.title,
    tags: s.tags,
    imageUrl: s.imageUrl,
    duration: s.duration,
    audioUrl: s.audioUrl,
    createdAt: s.createdAt.toISOString(),
    rating: s.rating,
    playCount: s.playCount,
    isFavorite: s.isFavorite,
  };
}
