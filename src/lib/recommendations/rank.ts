import { prisma } from "@/lib/prisma";
import { cosineSimilarity, parseEmbeddingVector } from "@/lib/embeddings";
import { formatSong, SONG_SELECT_FIELDS, type RecommendationResult } from "./format";

const CANDIDATES_LIMIT = 500;

export async function rankCandidates(
  userId: string,
  queryVector: number[],
  signalIds: Set<string>,
  excludeIds: Set<string>,
  limit: number,
): Promise<RecommendationResult> {
  const candidateEmbeddings = await prisma.songEmbedding.findMany({
    where: {
      song: {
        userId,
        generationStatus: "ready",
        archivedAt: null,
      },
      songId: {
        notIn: [...Array.from(signalIds), ...Array.from(excludeIds)],
      },
    },
    select: {
      songId: true,
      embedding: true,
    },
    take: CANDIDATES_LIMIT,
  });

  if (candidateEmbeddings.length === 0) {
    return coldStartFallback(userId, excludeIds, limit);
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

  const songs = await prisma.song.findMany({
    where: { id: { in: topIds } },
    select: SONG_SELECT_FIELDS,
  });

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const orderedSongs = topIds
    .map((id) => songMap.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  return {
    songs: orderedSongs.map(formatSong),
    total: orderedSongs.length,
    strategy: "embedding_similarity",
    generatedAt: new Date().toISOString(),
  };
}

export async function coldStartFallback(
  userId: string,
  excludeIds: Set<string>,
  limit: number,
): Promise<RecommendationResult> {
  const songs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      archivedAt: null,
      id: { notIn: Array.from(excludeIds) },
    },
    orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: SONG_SELECT_FIELDS,
  });

  return {
    songs: songs.map(formatSong),
    total: songs.length,
    strategy: "cold_start",
    generatedAt: new Date().toISOString(),
  };
}
