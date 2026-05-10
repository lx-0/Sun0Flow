import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { type Result, success, Err } from "@/lib/result";

// ── Constants ──────────────────────────────────────────────────────────────────

const RATE_LIMIT = 60;
const WINDOW_MS = 60 * 1000;
const MAX_SONGS = 10;
const MAX_PLAYLISTS = 5;

// ── Public types ───────────────────────────────────────────────────────────────

export interface SongHit {
  id: string;
  title: string | null;
  prompt: string | null;
  imageUrl: string | null;
  generationStatus: string;
  createdAt: Date;
  lyrics: string | null;
  songTags: { tag: { name: string } }[];
}

export interface PlaylistHit {
  id: string;
  name: string;
  description: string | null;
  _count: { songs: number };
  createdAt: Date;
}

export interface SearchOutput {
  songs: SongHit[];
  playlists: PlaylistHit[];
}

// ── Projections ────────────────────────────────────────────────────────────────

const SONG_HIT_SELECT = {
  id: true,
  title: true,
  prompt: true,
  imageUrl: true,
  generationStatus: true,
  createdAt: true,
  lyrics: true,
  songTags: { select: { tag: { select: { name: true } } }, take: 3 },
} satisfies Prisma.SongSelect;

const PLAYLIST_HIT_SELECT = {
  id: true,
  name: true,
  description: true,
  _count: {
    select: { songs: { where: { song: { archivedAt: null } } } },
  },
  createdAt: true,
} satisfies Prisma.PlaylistSelect;

// ── Query builders ─────────────────────────────────────────────────────────────

function songTextMatch(
  userId: string,
  q: string,
): Prisma.SongWhereInput {
  return {
    userId,
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { prompt: { contains: q, mode: "insensitive" } },
      { lyrics: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
      { songTags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
    ],
  };
}

function playlistTextMatch(
  userId: string,
  q: string,
): Prisma.PlaylistWhereInput {
  return {
    userId,
    name: { contains: q, mode: "insensitive" },
  };
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function searchUserContent(
  userId: string,
  query: string,
): Promise<Result<SearchOutput>> {
  const q = query.trim();

  if (!q) {
    return success({ songs: [], playlists: [] });
  }

  const { acquired } = await acquireRateLimitSlot(
    userId,
    "search",
    RATE_LIMIT,
    WINDOW_MS,
  );
  if (!acquired) {
    return Err.rateLimited("Search rate limit exceeded. Please slow down.");
  }

  const [songs, playlists] = await Promise.all([
    prisma.song.findMany({
      where: songTextMatch(userId, q),
      orderBy: { createdAt: "desc" },
      take: MAX_SONGS,
      select: SONG_HIT_SELECT,
    }),
    prisma.playlist.findMany({
      where: playlistTextMatch(userId, q),
      orderBy: { updatedAt: "desc" },
      take: MAX_PLAYLISTS,
      select: PLAYLIST_HIT_SELECT,
    }),
  ]);

  return success({ songs, playlists });
}
