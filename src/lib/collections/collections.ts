import { prisma } from "@/lib/prisma";
import { CacheTTL, cached, cacheKey } from "@/lib/cache";
import { success, Err, type Result } from "@/lib/result";

// ── Public types ───────────────────────────────────────────────────────────────

export interface CollectionSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null };
}

export interface CollectionSummary {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  songCount: number;
  previewSongs: CollectionSong[];
  createdAt: string;
}

export interface CollectionDetail {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  songCount: number;
  songs: CollectionSong[];
  createdAt: string;
}

// ── Projections ────────────────────────────────────────────────────────────────

const SONG_SELECT = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  audioUrl: true,
  duration: true,
  playCount: true,
  publicSlug: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} as const;

// ── Internal helpers ───────────────────────────────────────────────────────────

function formatSong(song: {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; username: string | null };
}): CollectionSong {
  return { ...song, createdAt: song.createdAt.toISOString() };
}

// ── Public interface ───────────────────────────────────────────────────────────

export async function listCollections(): Promise<Result<{ collections: CollectionSummary[] }>> {
  const key = cacheKey("collections", "list");
  const collections = await cached(
    key,
    async () => {
      const rows = await prisma.collection.findMany({
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        include: {
          songs: {
            orderBy: { position: "asc" },
            take: 4,
            include: { song: { select: SONG_SELECT } },
          },
          _count: { select: { songs: true } },
        },
      });

      return rows.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        coverImage: c.coverImage ?? c.songs[0]?.song.imageUrl ?? null,
        songCount: c._count.songs,
        previewSongs: c.songs.map((cs) => formatSong(cs.song)),
        createdAt: c.createdAt.toISOString(),
      }));
    },
    CacheTTL.DISCOVER,
  );

  return success({ collections });
}

export async function getCollection(id: string): Promise<Result<{ collection: CollectionDetail }>> {
  const key = cacheKey("collections", "detail", id);
  const collection = await cached(
    key,
    async () => {
      const row = await prisma.collection.findFirst({
        where: { id, isPublic: true },
        include: {
          songs: {
            orderBy: { position: "asc" },
            include: { song: { select: { ...SONG_SELECT, rating: true } } },
          },
          _count: { select: { songs: true } },
        },
      });

      if (!row) return null;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        coverImage: row.coverImage ?? row.songs[0]?.song.imageUrl ?? null,
        songCount: row._count.songs,
        songs: row.songs.map((cs) => formatSong(cs.song)),
        createdAt: row.createdAt.toISOString(),
      };
    },
    CacheTTL.DISCOVER,
  );

  if (!collection) {
    return Err.notFound("Collection not found");
  }

  return success({ collection });
}
