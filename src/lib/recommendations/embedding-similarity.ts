import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/embeddings";
import { parseEmbeddingVector } from "./taste-profile";
import type { SimilarSong } from "./similar";

const CANDIDATES_LIMIT = 500;

export interface EmbeddingSimilarityResult {
  songs: SimilarSong[];
  total: number;
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
    take: CANDIDATES_LIMIT,
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
    select: {
      id: true,
      title: true,
      tags: true,
      imageUrl: true,
      duration: true,
      audioUrl: true,
      createdAt: true,
    },
  });

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const orderedSongs = topIds
    .map((id) => {
      const s = songMap.get(id);
      if (!s) return null;
      return {
        id: s.id,
        title: s.title,
        tags: s.tags,
        imageUrl: s.imageUrl,
        duration: s.duration,
        audioUrl: s.audioUrl,
        createdAt: s.createdAt.toISOString(),
        score: scoreMap.get(id) ?? 0,
      };
    })
    .filter((s): s is SimilarSong => s !== null);

  return { songs: orderedSongs, total: orderedSongs.length };
}
