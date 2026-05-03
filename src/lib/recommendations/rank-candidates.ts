import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/embeddings";
import { formatSong, SONG_SELECT_FIELDS } from "./types";
import type { RecommendationResult } from "./types";

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
    const fallback = await prisma.song.findMany({
      where: {
        userId,
        generationStatus: "ready",
        archivedAt: null,
        id: { notIn: Array.from(excludeIds) },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: SONG_SELECT_FIELDS,
    });

    return {
      songs: fallback.map(formatSong),
      total: fallback.length,
      strategy: "fallback_no_candidates",
      generatedAt: new Date().toISOString(),
    };
  }

  const scored = candidateEmbeddings
    .map((e) => ({
      songId: e.songId,
      score: cosineSimilarity(queryVector, e.embedding as unknown as number[]),
    }))
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
