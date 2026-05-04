import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";
import { formatSong, SONG_SELECT_FIELDS } from "./types";
import type { RecommendationResult, SongRow } from "./types";

const TOP_RATED_COUNT = 7;
const GENRE_MATCH_COUNT = 8;
const EXPLORATION_COUNT = 5;
const DEFAULT_LIMIT = 20;

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  for (let i = copy.length - 1; i > 0; i--) {
    hash = (Math.imul(hash, 1664525) + 1013904223) | 0;
    const j = Math.abs(hash) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function getDailyMix(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<RecommendationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredGenres: true },
  });
  const preferredGenres = (user?.preferredGenres ?? []).map((g: string) => g.toLowerCase());

  const today = new Date().toISOString().slice(0, 10);
  const baseWhere = { userId, archivedAt: null as null, generationStatus: "ready" as const };

  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const topRated = await prisma.song.findMany({
    where: {
      ...baseWhere,
      rating: { gte: 4 },
      createdAt: { gte: sixtyDaysAgo },
    },
    orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
    take: TOP_RATED_COUNT * 3,
    select: SONG_SELECT_FIELDS,
  });

  const genreTokens = [...preferredGenres];
  if (genreTokens.length === 0) {
    const recentFavorites = await prisma.favorite.findMany({
      where: { userId },
      include: { song: { select: { tags: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    for (const fav of recentFavorites) {
      genreTokens.push(...parseTags(fav.song.tags));
    }
  }

  let genrePool: SongRow[] = [];
  if (genreTokens.length > 0) {
    const genreSet = new Set(genreTokens.slice(0, 20));
    const genreCandidates = await prisma.song.findMany({
      where: {
        ...baseWhere,
        id: { notIn: topRated.map((s) => s.id) },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: SONG_SELECT_FIELDS,
    });

    genrePool = seededShuffle(
      genreCandidates.filter((s) => {
        const songTokens = parseTags(s.tags);
        return songTokens.some((t) => genreSet.has(t));
      }),
      today,
    ).slice(0, GENRE_MATCH_COUNT * 2);
  }

  const excludeIds = new Set([
    ...topRated.map((s) => s.id),
    ...genrePool.map((s) => s.id),
  ]);

  const explorationCandidates = await prisma.song.findMany({
    where: {
      ...baseWhere,
      id: { notIn: Array.from(excludeIds) },
    },
    orderBy: { playCount: "asc" },
    take: EXPLORATION_COUNT * 3,
    select: SONG_SELECT_FIELDS,
  });

  const explorationPool = seededShuffle(explorationCandidates, today).slice(
    0,
    EXPLORATION_COUNT,
  );

  const allSeen = new Set<string>();
  const playlist: SongRow[] = [];

  for (const s of [
    ...seededShuffle(topRated, today).slice(0, TOP_RATED_COUNT),
    ...seededShuffle(genrePool, today).slice(0, GENRE_MATCH_COUNT),
    ...explorationPool,
  ]) {
    if (!allSeen.has(s.id) && playlist.length < limit) {
      allSeen.add(s.id);
      playlist.push(s);
    }
  }

  return {
    songs: playlist.map(formatSong),
    total: playlist.length,
    strategy: "daily_mix",
    generatedAt: new Date().toISOString(),
  };
}
