export interface DiscoverSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null };
}

export interface TrendingSong {
  id: string;
  title: string | null;
  genre: string | null;
  albumArtUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  score: number;
  creatorDisplayName: string;
  creatorUsername: string | null;
}

export interface PublicSong {
  id: string;
  title: string | null;
  creatorDisplayName: string;
  creatorUserId: string;
  creatorUsername: string | null;
  albumArtUrl: string | null;
  audioUrl: string | null;
  publicSlug: string | null;
  duration: number | null;
  genre: string | null;
  playCount: number;
  createdAt: string;
}

export interface PublicPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DiscoverPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export interface TrendingPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export type Tab =
  | "for_you"
  | "browse"
  | "trending"
  | "popular"
  | "collections"
  | "playlists";

export interface FeedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  creatorDisplayName: string;
  creatorUsername: string | null;
  creatorUserId: string;
  reason: "recommended" | "followed_artist" | "trending" | "new_release";
  reasonLabel: string;
}

export interface FeedPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export interface DiscoverPlaylist {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  slug: string | null;
  songCount: number;
  publishedAt: string | null;
  playCount: number;
  createdAt: string;
  creatorDisplayName: string;
  creatorUsername: string | null;
  score?: number;
}

export interface PlaylistDiscoverPagination {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export interface CollectionPreview {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  songCount: number;
  previewSongs: {
    id: string;
    imageUrl: string | null;
  }[];
  createdAt: string;
}
