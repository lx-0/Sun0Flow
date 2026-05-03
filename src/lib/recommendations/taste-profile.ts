import { prisma } from "@/lib/prisma";
import { computeCentroid } from "@/lib/embeddings";

export async function computeTasteProfile(signalIds: Set<string>): Promise<number[] | null> {
  if (signalIds.size === 0) return null;

  const signalEmbeddings = await prisma.songEmbedding.findMany({
    where: { songId: { in: Array.from(signalIds) } },
    select: { embedding: true },
  });

  const vectors = signalEmbeddings
    .map((e) => e.embedding as unknown as number[])
    .filter((v) => Array.isArray(v) && v.length > 0);

  return computeCentroid(vectors);
}
