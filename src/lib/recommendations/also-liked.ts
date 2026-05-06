import { prisma } from "@/lib/prisma";
import { parseTags, collectSongTokens, tagOverlapScore } from "@/lib/tags";

const MIN_FAVORITES_FOR_COLLABORATIVE = 10;

interface AlsoLikedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
}

const SONG_FIELDS = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  duration: true,
  audioUrl: true,
  createdAt: true,
} as const;

function formatSong(s: { id: string; title: string | null; tags: string | null; imageUrl: string | null; duration: number | null; audioUrl: string | null; createdAt: Date }): AlsoLikedSong {
  return { ...s, createdAt: s.createdAt.toISOString() };
}

async function collaborativeResults(
  songId: string,
  userId: string,
  allTargetTokens: string[],
  limit: number,
): Promise<AlsoLikedSong[]> {
  const coFavoriters = await prisma.favorite.findMany({
    where: { songId, userId: { not: userId } },
    select: { userId: true },
    take: 100,
  });

  let songs: AlsoLikedSong[] = [];

  if (coFavoriters.length > 0) {
    const coFavoriterIds = coFavoriters.map((f) => f.userId);
    const coFavoritedSongs = await prisma.favorite.groupBy({
      by: ["songId"],
      where: {
        userId: { in: coFavoriterIds },
        songId: { not: songId },
        song: { isPublic: true, archivedAt: null, generationStatus: "ready" },
      },
      _count: { songId: true },
      orderBy: { _count: { songId: "desc" } },
      take: limit,
    });

    if (coFavoritedSongs.length > 0) {
      const rows = await prisma.song.findMany({
        where: { id: { in: coFavoritedSongs.map((f) => f.songId) } },
        select: SONG_FIELDS,
      });
      songs = rows.map(formatSong);
    }
  }

  if (songs.length < limit) {
    const remaining = limit - songs.length;
    const excludeIds = new Set([songId, ...songs.map((s) => s.id)]);
    const userFavoritedIds = await prisma.favorite.findMany({
      where: { userId, songId: { not: songId } },
      select: { songId: true },
    });
    const candidates = await prisma.song.findMany({
      where: {
        userId,
        id: { in: userFavoritedIds.map((f) => f.songId).filter((sid) => !excludeIds.has(sid)) },
        archivedAt: null,
        generationStatus: "ready",
      },
      include: { songTags: { include: { tag: true } } },
      take: 50,
    });

    const scored = candidates
      .map((c) => ({
        song: c,
        score: tagOverlapScore(allTargetTokens, collectSongTokens(c.songTags, c.tags)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, remaining);

    songs = [...songs, ...scored.map(({ song: s }) => formatSong(s))];
  }

  return songs;
}

async function tagFallbackResults(
  songId: string,
  userId: string,
  allTargetTokens: string[],
  limit: number,
): Promise<AlsoLikedSong[]> {
  const candidates = await prisma.song.findMany({
    where: {
      userId,
      id: { not: songId },
      archivedAt: null,
      generationStatus: "ready",
    },
    include: { songTags: { include: { tag: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return candidates
    .map((c) => ({
      song: c,
      score: tagOverlapScore(allTargetTokens, collectSongTokens(c.songTags, c.tags)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ song: s }) => formatSong(s));
}

export async function getAlsoLiked(
  songId: string,
  userId: string,
  limit: number,
): Promise<AlsoLikedSong[] | null> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    include: { songTags: { include: { tag: true } } },
  });
  if (!song) return null;

  const allTargetTokens = collectSongTokens(song.songTags, song.tags);
  const totalFavorites = await prisma.favorite.count({ where: { userId } });

  if (totalFavorites >= MIN_FAVORITES_FOR_COLLABORATIVE) {
    return collaborativeResults(songId, userId, allTargetTokens, limit);
  }

  return tagFallbackResults(songId, userId, allTargetTokens, limit);
}
