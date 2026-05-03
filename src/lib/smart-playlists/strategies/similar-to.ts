import { prisma } from "@/lib/prisma";
import { computeCentroid } from "@/lib/embeddings";
import { SMART_PLAYLIST_SIZE } from "../types";
import { rankBySimilarity } from "../rank-by-similarity";

export async function computeSimilarTo(
  userId: string,
  sourceSongId: string,
): Promise<string[]> {
  const sourceEmb = await prisma.songEmbedding.findUnique({
    where: { songId: sourceSongId },
    select: { embedding: true },
  });

  if (!sourceEmb) return [];

  const queryVector = computeCentroid([sourceEmb.embedding as unknown as number[]]);
  if (!queryVector) return [];

  const candidates = await prisma.songEmbedding.findMany({
    where: {
      song: { userId, generationStatus: "ready", archivedAt: null },
      songId: { not: sourceSongId },
    },
    select: { songId: true, embedding: true },
    take: 500,
  });

  return rankBySimilarity(
    queryVector,
    candidates.map((c) => ({ songId: c.songId, embedding: c.embedding as unknown as number[] })),
    SMART_PLAYLIST_SIZE,
  );
}
