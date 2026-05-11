import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { buildDiscoverableFilter } from "./filters";

export type PublicSongSort = "newest" | "popular" | "trending";

export interface PublicSongsQuery {
  search?: string;
  genre?: string;
  mood?: string;
  sort?: PublicSongSort;
  limit?: number;
  offset?: number;
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
  createdAt: Date;
}

export interface PublicSongsResult {
  songs: PublicSong[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const PUBLIC_SONG_SELECT = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  audioUrl: true,
  publicSlug: true,
  duration: true,
  playCount: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} as const;

type PublicSongRow = Prisma.SongGetPayload<{
  select: typeof PUBLIC_SONG_SELECT;
}>;

function formatPublicSong(s: PublicSongRow): PublicSong {
  return {
    id: s.id,
    title: s.title,
    creatorDisplayName: s.user.name || s.user.username || "Anonymous",
    creatorUserId: s.user.id,
    creatorUsername: s.user.username || null,
    albumArtUrl: s.imageUrl,
    audioUrl: s.audioUrl,
    publicSlug: s.publicSlug,
    duration: s.duration,
    genre: s.tags || null,
    playCount: s.playCount,
    createdAt: s.createdAt,
  };
}

function rankByRelevance(songs: PublicSong[], query: string): PublicSong[] {
  const ql = query.toLowerCase();
  return [...songs].sort((a, b) => {
    const score = (item: PublicSong) => {
      if (item.title?.toLowerCase().includes(ql)) return 3;
      if (item.genre?.toLowerCase().includes(ql)) return 2;
      if (item.creatorDisplayName.toLowerCase().includes(ql)) return 2;
      return 1;
    };
    return score(b) - score(a);
  });
}

export async function queryPublicSongs(
  query: PublicSongsQuery,
): Promise<PublicSongsResult> {
  const {
    search = "",
    genre = "",
    mood = "",
    sort = "newest",
    limit: rawLimit,
    offset: rawOffset,
  } = query;

  const limit =
    rawLimit !== undefined && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 20;
  const offset = rawOffset !== undefined && rawOffset >= 0 ? rawOffset : 0;

  const base: Prisma.SongWhereInput = {
    ...buildDiscoverableFilter({ genre: genre || undefined, mood: mood || undefined }),
  };

  if (sort === "trending") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    base.createdAt = { gte: thirtyDaysAgo };
  }

  if (search) {
    base.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { tags: { contains: search, mode: "insensitive" } },
      { lyrics: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { username: { contains: search, mode: "insensitive" } } },
    ];
  }

  const where = base;

  let orderBy: Prisma.SongOrderByWithRelationInput;
  switch (sort) {
    case "popular":
    case "trending":
      orderBy = { playCount: "desc" };
      break;
    case "newest":
    default:
      orderBy = { createdAt: "desc" };
      break;
  }

  const key = cacheKey(
    "public-songs",
    search || "all",
    genre || "any",
    mood || "any",
    sort,
    String(limit),
    String(offset),
  );

  const { songs: rows, total } = await cached(
    key,
    async () => {
      const [results, count] = await Promise.all([
        prisma.song.findMany({
          where,
          orderBy,
          skip: offset,
          take: limit,
          select: PUBLIC_SONG_SELECT,
        }),
        prisma.song.count({ where }),
      ]);
      return { songs: results, total: count };
    },
    CacheTTL.PUBLIC_SONG,
  );

  let songs = rows.map(formatPublicSong);

  if (search) {
    songs = rankByRelevance(songs, search);
  }

  return {
    songs,
    pagination: { total, limit, offset, hasMore: offset + limit < total },
  };
}
