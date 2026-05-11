import { prisma } from "@/lib/prisma";
import { collectSongTokens, tagOverlapScore } from "@/lib/tags";
import { cosineSimilarity, parseEmbeddingVector } from "@/lib/embeddings";
import { formatBaseSong, BASE_SONG_SELECT, type BaseSongResult } from "./format";

export interface SimilarSong extends BaseSongResult {
  score: number;
}

export interface EmbeddingSimilarityResult {
  songs: SimilarSong[];
  total: number;
}

const EMBEDDING_CANDIDATES_LIMIT = 500;

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

  const candidateEmbeddings = await prisma.songEmbedding.findMany({
    where: {
      songId: { not: songId },
      song: {
        userId,
        generationStatus: "ready",
        archivedAt: null,
      },
    },
    select: {
      songId: true,
      embedding: true,
    },
    take: EMBEDDING_CANDIDATES_LIMIT,
  });

  if (candidateEmbeddings.length === 0) {
    return { songs: [], total: 0 };
  }

  const scored = candidateEmbeddings
    .map((e) => {
      const vec = parseEmbeddingVector(e.embedding);
      return {
        songId: e.songId,
        score: vec ? cosineSimilarity(queryVector, vec) : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

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
