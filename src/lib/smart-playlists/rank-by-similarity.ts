import { cosineSimilarity } from "@/lib/embeddings";

export interface EmbeddingCandidate {
  songId: string;
  embedding: number[];
}

export function rankBySimilarity(
  queryVector: number[],
  candidates: EmbeddingCandidate[],
  limit: number,
): string[] {
  return candidates
    .map((c) => ({
      songId: c.songId,
      score: cosineSimilarity(queryVector, c.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.songId);
}
