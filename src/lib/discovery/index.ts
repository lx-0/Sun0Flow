import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { buildDiscoverableFilter, SongSelect } from "@/lib/songs";
import { trendingScore } from "@/lib/scoring";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const TRENDING_POOL_SIZE = 500;
const TRENDING_WINDOW_DAYS = 30;

// ── Shared ──────────────────────────────────────────────────────────────────

function trendingCutoff(): Date {
  return new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function paginationMeta(page: number, limit: number, total: number) {
  return { ...offsetPagination(page, limit, total), limit };
}

// ── Song Trending / Popular ─────────────────────────────────────────────────

export interface TrendingSongsQuery {
  sort: "trending" | "popular";
  genre?: string;
  mood?: string;
  limit: number;
  offset: number;
}

type SongPublicRow = Prisma.SongGetPayload<{
  select: typeof SongSelect.public;
}>;

function formatTrendingSong(s: SongPublicRow, score: number) {
  return {
    id: s.id,
    title: s.title,
    genre: s.tags || null,
    albumArtUrl: s.imageUrl,
    audioUrl: s.audioUrl,
    duration: s.duration,
    playCount: s.playCount,
    publicSlug: s.publicSlug,
    createdAt: s.createdAt,
    score,
    creatorDisplayName: s.user.name || s.user.username || "Anonymous",
    creatorUsername: s.user.username || null,
  };
}

export async function trendingSongs(q: TrendingSongsQuery) {
  const key = cacheKey(
    "trending-v1",
    q.sort,
    q.genre || "any",
    q.mood || "any",
    String(q.limit),
    String(q.offset),
  );

  const { songs, total } = await cached(
    key,
    async () => {
      const baseWhere = buildDiscoverableFilter({ genre: q.genre, mood: q.mood });

      if (q.sort === "popular") {
        const [rows, count] = await Promise.all([
          prisma.song.findMany({
            where: baseWhere,
            orderBy: { playCount: "desc" },
            skip: q.offset,
            take: q.limit,
            select: SongSelect.public,
          }),
          prisma.song.count({ where: baseWhere }),
        ]);
        return {
          songs: rows.map((s) => formatTrendingSong(s, s.playCount)),
          total: count,
        };
      }

      const trendingWhere = {
        ...baseWhere,
        createdAt: { gte: trendingCutoff() },
      };

      const [pool, count] = await Promise.all([
        prisma.song.findMany({
          where: trendingWhere,
          orderBy: { playCount: "desc" },
          take: TRENDING_POOL_SIZE,
          select: SongSelect.public,
        }),
        prisma.song.count({ where: trendingWhere }),
      ]);

      const scored = pool
        .map((s) =>
          formatTrendingSong(
            s,
            trendingScore(s.playCount, s.downloadCount, s.createdAt),
          ),
        )
        .sort((a, b) => b.score - a.score);

      return { songs: scored.slice(q.offset, q.offset + q.limit), total: count };
    },
    CacheTTL.RECOMMENDATIONS,
  );

  return {
    songs,
    sort: q.sort,
    pagination: {
      total,
      limit: q.limit,
      offset: q.offset,
      hasMore: q.offset + q.limit < total,
    },
  };
}

// ── Song Discovery (Browse) ─────────────────────────────────────────────────

export interface DiscoverSongsQuery {
  sortBy: "newest" | "highest_rated" | "most_played";
  tag?: string;
  mood?: string;
  tempoMin?: number | null;
  tempoMax?: number | null;
  page: number;
}

export async function discoverSongs(q: DiscoverSongsQuery) {
  const skip = pageSkip(q.page, DEFAULT_PAGE_SIZE);

  const key = cacheKey(
    "discover",
    q.sortBy,
    q.tag || "all",
    q.mood || "any",
    q.tempoMin != null ? String(q.tempoMin) : "0",
    q.tempoMax != null ? String(q.tempoMax) : "999",
    String(q.page),
  );

  const { songs, total } = await cached(
    key,
    async () => {
      const where = buildDiscoverableFilter({
        genre: q.tag || undefined,
        mood: q.mood || undefined,
        tempoMin: q.tempoMin ?? undefined,
        tempoMax: q.tempoMax ?? undefined,
      });

      let orderBy: Prisma.SongOrderByWithRelationInput;
      switch (q.sortBy) {
        case "highest_rated":
          orderBy = { rating: { sort: "desc", nulls: "last" } };
          break;
        case "most_played":
          orderBy = { playCount: "desc" };
          break;
        case "newest":
        default:
          orderBy = { createdAt: "desc" };
          break;
      }

      const [results, count] = await Promise.all([
        prisma.song.findMany({
          where,
          orderBy,
          skip,
          take: DEFAULT_PAGE_SIZE,
          select: SongSelect.public,
        }),
        prisma.song.count({ where }),
      ]);

      return { songs: results, total: count };
    },
    CacheTTL.DISCOVER,
  );

  return {
    songs,
    pagination: paginationMeta(q.page, DEFAULT_PAGE_SIZE, total),
  };
}

// ── Playlist Discovery ──────────────────────────────────────────────────────

export interface DiscoverPlaylistsQuery {
  sort: "trending" | "recent" | "popular";
  genre?: string;
  page: number;
  limit: number;
}

const PLAYLIST_DISCOVER_SELECT = {
  id: true,
  name: true,
  description: true,
  genre: true,
  slug: true,
  publishedAt: true,
  playCount: true,
  shareCount: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
  _count: {
    select: { songs: { where: { song: { archivedAt: null } } } },
  },
} as const;

type PlaylistDiscoverRow = Prisma.PlaylistGetPayload<{
  select: typeof PLAYLIST_DISCOVER_SELECT;
}>;

function formatPlaylist(p: PlaylistDiscoverRow) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    genre: p.genre,
    slug: p.slug,
    songCount: p._count.songs,
    publishedAt: p.publishedAt,
    playCount: p.playCount,
    createdAt: p.createdAt,
    creatorDisplayName: p.user.name || p.user.username || "Anonymous",
    creatorUsername: p.user.username || null,
  };
}

export async function discoverPlaylists(q: DiscoverPlaylistsQuery) {
  const skip = (q.page - 1) * q.limit;

  const key = cacheKey(
    "playlist-discover-v1",
    q.sort,
    q.genre || "any",
    String(q.page),
    String(q.limit),
  );

  const result = await cached(
    key,
    async () => {
      const baseWhere: Prisma.PlaylistWhereInput = { isPublished: true };
      if (q.genre) {
        baseWhere.genre = { contains: q.genre, mode: "insensitive" };
      }

      if (q.sort === "trending") {
        const trendingWhere: Prisma.PlaylistWhereInput = {
          ...baseWhere,
          publishedAt: { gte: trendingCutoff() },
        };

        const [pool, count] = await Promise.all([
          prisma.playlist.findMany({
            where: trendingWhere,
            orderBy: { playCount: "desc" },
            take: TRENDING_POOL_SIZE,
            select: PLAYLIST_DISCOVER_SELECT,
          }),
          prisma.playlist.count({ where: trendingWhere }),
        ]);

        const scored = pool
          .map((p) => ({
            ...formatPlaylist(p),
            score: trendingScore(p.playCount, p.shareCount, p.publishedAt!),
          }))
          .sort((a, b) => b.score - a.score);

        return { playlists: scored.slice(skip, skip + q.limit), total: count };
      }

      const orderBy: Prisma.PlaylistOrderByWithRelationInput =
        q.sort === "popular"
          ? { playCount: "desc" }
          : { publishedAt: "desc" };

      const [playlists, count] = await Promise.all([
        prisma.playlist.findMany({
          where: baseWhere,
          orderBy,
          skip,
          take: q.limit,
          select: PLAYLIST_DISCOVER_SELECT,
        }),
        prisma.playlist.count({ where: baseWhere }),
      ]);

      return { playlists: playlists.map(formatPlaylist), total: count };
    },
    CacheTTL.DISCOVER,
  );

  return {
    playlists: result.playlists,
    sort: q.sort,
    pagination: paginationMeta(q.page, q.limit, result.total),
  };
}
