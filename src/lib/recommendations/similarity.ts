import { prisma } from "@/lib/prisma";
import { collectSongTokens, tagOverlapScore } from "@/lib/tags";
import { parseEmbeddingVector } from "@/lib/embeddings";
import { formatBaseSong, BASE_SONG_SELECT, type BaseSongResult } from "./format";
import { scoreByEmbedding } from "./embedding-search";

export interface SimilarSong extends BaseSongResult {
  score: number;
}

export interface EmbeddingSimilarityResult {
  songs: SimilarSong[];
  total: number;
}

export async function getSimilarSongs(
  songId: string,
  userId: string,
  limit: number,
): Promise<SimilarSong[] | null> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    include: { songTags: { include: { tag: true } } },
  });
  if (!song) return null;

  const targetTokens = collectSongTokens(song.songTags, song.tags);

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
      ...formatBaseSong(c),
      score: tagOverlapScore(targetTokens, collectSongTokens(c.songTags, c.tags)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function findSimilarByEmbedding(
  songId: string,
  userId: string,
  limit: number,
): Promise<EmbeddingSimilarityResult | null> {
  const targetEmbedding = await prisma.songEmbedding.findUnique({
    where: { songId },
    select: { embedding: true },
  });

  if (!targetEmbedding) return null;

  const queryVector = parseEmbeddingVector(targetEmbedding.embedding);
  if (!queryVector) return null;

  const scored = await scoreByEmbedding(
    queryVector,
    {
      songId: { not: songId },
      song: { userId, generationStatus: "ready", archivedAt: null },
    },
    limit,
  );

  if (scored.length === 0) {
    return { songs: [], total: 0 };
  }

  const topIds = scored.map((s) => s.songId);
  const scoreMap = new Map(scored.map((s) => [s.songId, s.score]));

  const songs = await prisma.song.findMany({
    where: { id: { in: topIds } },
    select: BASE_SONG_SELECT,
  });

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const orderedSongs = topIds
    .map((id) => {
      const s = songMap.get(id);
      if (!s) return null;
      return {
        ...formatBaseSong(s),
        score: scoreMap.get(id) ?? 0,
      };
    })
    .filter((s): s is SimilarSong => s !== null);

  return { songs: orderedSongs, total: orderedSongs.length };
}
