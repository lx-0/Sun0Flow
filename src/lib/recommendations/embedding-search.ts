import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cosineSimilarity, parseEmbeddingVector } from "@/lib/embeddings";

export interface ScoredSongId {
  songId: string;
  score: number;
}

const DEFAULT_CANDIDATE_LIMIT = 500;

export async function scoreByEmbedding(
  queryVector: number[],
  where: Prisma.SongEmbeddingWhereInput,
  limit: number,
  candidateLimit: number = DEFAULT_CANDIDATE_LIMIT,
): Promise<ScoredSongId[]> {
  const candidates = await prisma.songEmbedding.findMany({
    where,
    select: { songId: true, embedding: true },
    take: candidateLimit,
  });

  return candidates
    .map((e) => {
      const vec = parseEmbeddingVector(e.embedding);
      return {
        songId: e.songId,
        score: vec ? cosineSimilarity(queryVector, vec) : 0,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
