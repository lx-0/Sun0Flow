import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";
import { cursorPaginate } from "@/lib/pagination";
import { type Result, success, Err } from "@/lib/result";

// ---------------------------------------------------------------------------
// Accessible-song resolution — shared by favorites and other song routes
// ---------------------------------------------------------------------------

export async function findAccessibleSong(songId: string, userId: string) {
  return prisma.song.findFirst({
    where: {
      id: songId,
      OR: [{ userId }, { isPublic: true }],
    },
  });
}

// ---------------------------------------------------------------------------
// Check / Add / Remove
// ---------------------------------------------------------------------------

export type FavoriteStatus = { isFavorite: boolean };
export type FavoriteToggleResult = { isFavorite: boolean; favoriteCount: number };

export async function checkFavorite(
  songId: string,
  userId: string,
): Promise<Result<FavoriteStatus>> {
  const song = await findAccessibleSong(songId, userId);
  if (!song) return Err.notFound();

  const existing = await prisma.favorite.findUnique({
    where: { userId_songId: { userId, songId: song.id } },
  });

  return success({ isFavorite: !!existing });
}

export async function addFavorite(
  songId: string,
  userId: string,
): Promise<Result<FavoriteToggleResult & { favoriteId: string }>> {
  const song = await findAccessibleSong(songId, userId);
  if (!song) return Err.notFound();

  const favorite = await prisma.favorite.upsert({
    where: { userId_songId: { userId, songId: song.id } },
    create: { userId, songId: song.id },
    update: {},
  });

  const count = await prisma.favorite.count({ where: { songId: song.id } });

  invalidateByPrefix(`dashboard-stats:${userId}`);
  recordActivity({ userId, type: "song_favorited", songId: song.id });

  return success({ isFavorite: true, favoriteCount: count, favoriteId: favorite.id });
}

export async function removeFavorite(
  songId: string,
  userId: string,
): Promise<Result<FavoriteToggleResult>> {
  const song = await findAccessibleSong(songId, userId);
  if (!song) return Err.notFound();

  await prisma.favorite.deleteMany({
    where: { userId, songId: song.id },
  });

  const count = await prisma.favorite.count({ where: { songId: song.id } });

  invalidateByPrefix(`dashboard-stats:${userId}`);

  return success({ isFavorite: false, favoriteCount: count });
}

// ---------------------------------------------------------------------------
// List favorites (paginated, searchable, sortable)
// ---------------------------------------------------------------------------

export type FavoriteSort = "recently_liked" | "newest" | "oldest" | "title_az";

export interface FavoritesQuery {
  userId: string;
  search?: string;
  status?: string;
  sortBy?: FavoriteSort;
  limit?: number;
  cursor?: string;
}

type FavoriteSongBase = Prisma.SongGetPayload<{
  include: {
    songTags: { include: { tag: true } };
    _count: { select: { favorites: true } };
  };
}>;

export type FavoriteSong = Omit<FavoriteSongBase, "_count"> & {
  isFavorite: true;
  favoriteCount: number;
  favoritedAt: Date;
};

export interface FavoritesResult {
  songs: FavoriteSong[];
  nextCursor: string | null;
  total: number;
}

export async function listFavorites(query: FavoritesQuery): Promise<FavoritesResult> {
  const {
    userId,
    search,
    status,
    sortBy = "recently_liked",
    cursor,
  } = query;
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

  const songWhere: Prisma.SongWhereInput = { userId };

  if (search) {
    songWhere.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { prompt: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && ["ready", "pending", "failed"].includes(status)) {
    songWhere.generationStatus = status;
  }

  let favoriteOrderBy: Prisma.FavoriteOrderByWithRelationInput;
  switch (sortBy) {
    case "newest":
      favoriteOrderBy = { song: { createdAt: "desc" } };
      break;
    case "oldest":
      favoriteOrderBy = { song: { createdAt: "asc" } };
      break;
    case "title_az":
      favoriteOrderBy = { song: { title: { sort: "asc", nulls: "last" } } };
      break;
    case "recently_liked":
    default:
      favoriteOrderBy = { createdAt: "desc" };
      break;
  }

  const [favorites, total] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId, song: songWhere },
      include: {
        song: {
          include: {
            songTags: {
              include: { tag: true },
              orderBy: { tag: { name: "asc" } },
            },
            _count: { select: { favorites: true } },
          },
        },
      },
      orderBy: favoriteOrderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.favorite.count({ where: { userId, song: songWhere } }),
  ]);

  const { items: sliced, nextCursor } = cursorPaginate(favorites, limit);

  const songs: FavoriteSong[] = sliced.map((f) => ({
    ...f.song,
    isFavorite: true as const,
    favoriteCount: f.song._count.favorites,
    favoritedAt: f.createdAt,
  }));

  return { songs, nextCursor, total };
}
