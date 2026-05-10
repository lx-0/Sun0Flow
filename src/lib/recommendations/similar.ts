import { prisma } from "@/lib/prisma";
import { collectSongTokens, tagOverlapScore } from "@/lib/tags";
import { formatBaseSong, type BaseSongResult } from "./format";

export interface SimilarSong extends BaseSongResult {
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
    .map((c) => ({
      ...formatBaseSong(c),
      score: tagOverlapScore(targetTokens, collectSongTokens(c.songTags, c.tags)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
