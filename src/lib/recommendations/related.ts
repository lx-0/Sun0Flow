import { prisma } from "@/lib/prisma";
import { collectSongTokens, tagOverlapScore } from "@/lib/tags";
import { SongFilters } from "@/lib/songs";

export interface RelatedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  publicSlug: string | null;
  creatorName: string | null;
  creatorUsername: string | null;
  score: number;
}

export interface RelatedResult {
  songs: RelatedSong[];
  source: "similarity" | "trending";
}

export async function getRelatedSongs(
  songId: string,
  limit: number,
): Promise<RelatedResult | null> {
  const song = await prisma.song.findUnique({
    where: { id: songId },
    include: { songTags: { include: { tag: true } } },
  });

  if (!song || !song.isPublic || song.isHidden || song.archivedAt) return null;

  const targetTokens = collectSongTokens(song.songTags, song.tags);

  const candidates = await prisma.song.findMany({
    where: {
      ...SongFilters.publicDiscovery(),
      id: { not: songId },
      userId: { not: song.userId },
    },
    include: {
      songTags: { include: { tag: true } },
      user: { select: { name: true, username: true } },
    },
    orderBy: { playCount: "desc" },
    take: 300,
  });

  const scored = candidates
    .map((c) => ({
      song: c,
      score: tagOverlapScore(targetTokens, collectSongTokens(c.songTags, c.tags)),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length > 0) {
    return {
      songs: scored.map(({ song: s, score }) => ({
        id: s.id,
        title: s.title,
        tags: s.tags,
        imageUrl: s.imageUrl,
        duration: s.duration,
        audioUrl: s.audioUrl,
        publicSlug: s.publicSlug,
        creatorName: s.user.name,
        creatorUsername: s.user.username,
        score,
      })),
      source: "similarity",
    };
  }

  const trending = await prisma.song.findMany({
    where: {
      ...SongFilters.publicDiscovery(),
      id: { not: songId },
      userId: { not: song.userId },
    },
    include: { user: { select: { name: true, username: true } } },
    orderBy: { playCount: "desc" },
    take: limit,
  });

  return {
    songs: trending.map((s) => ({
      id: s.id,
      title: s.title,
      tags: s.tags,
      imageUrl: s.imageUrl,
      duration: s.duration,
      audioUrl: s.audioUrl,
      publicSlug: s.publicSlug,
      creatorName: s.user.name,
      creatorUsername: s.user.username,
      score: 0,
    })),
    source: "trending",
  };
}
