import { prisma } from "@/lib/prisma";
import { collectSongTokens, tagOverlapScore } from "@/lib/tags";

export interface SimilarSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
  score: number;
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
    .map((c) => {
      const score = tagOverlapScore(targetTokens, collectSongTokens(c.songTags, c.tags));
      return {
        id: c.id,
        title: c.title,
        tags: c.tags,
        imageUrl: c.imageUrl,
        duration: c.duration,
        audioUrl: c.audioUrl,
        createdAt: c.createdAt.toISOString(),
        score,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
