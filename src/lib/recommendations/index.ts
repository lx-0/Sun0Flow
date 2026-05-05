import { prisma } from "@/lib/prisma";
import { gatherUserSignals } from "@/lib/user-signals";
import { computeCentroid, cosineSimilarity } from "@/lib/embeddings";
import { parseTags } from "@/lib/tags";

// --- Public types ---

export interface RecommendationOptions {
  userId: string;
  limit: number;
  excludeIds: Set<string>;
}

export interface RecommendedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
}

export interface RecommendationResult {
  songs: RecommendedSong[];
  total: number;
  strategy: "embedding_similarity" | "cold_start" | "fallback_no_candidates" | "daily_mix";
  generatedAt: string;
}

// --- Internal constants ---

const SIGNAL_SONGS_LIMIT = 30;
const CANDIDATES_LIMIT = 500;
const TOP_RATED_COUNT = 7;
const GENRE_MATCH_COUNT = 8;
const EXPLORATION_COUNT = 5;
const DEFAULT_DAILY_LIMIT = 20;

const SONG_SELECT_FIELDS = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  duration: true,
  audioUrl: true,
  createdAt: true,
  rating: true,
  playCount: true,
  isFavorite: true,
} as const;

type SongRow = {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: Date;
  rating: number | null;
  playCount: number;
  isFavorite: boolean;
};

// --- Internal helpers ---

function formatSong(s: SongRow): RecommendedSong {
  return {
    id: s.id,
    title: s.title,
    tags: s.tags,
    imageUrl: s.imageUrl,
    duration: s.duration,
    audioUrl: s.audioUrl,
    createdAt: s.createdAt.toISOString(),
    rating: s.rating,
    playCount: s.playCount,
    isFavorite: s.isFavorite,
  };
}

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

async function gatherSignalIds(userId: string): Promise<Set<string>> {
  const [signals, recentGenerated] = await Promise.all([
    gatherUserSignals(userId, { limit: SIGNAL_SONGS_LIMIT }),
    prisma.song.findMany({
      where: { userId, generationStatus: "ready", archivedAt: null },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: SIGNAL_SONGS_LIMIT,
    }),
  ]);

  for (const s of recentGenerated) {
    signals.songIds.add(s.id);
  }

  return signals.songIds;
}

async function computeTasteProfile(signalIds: Set<string>): Promise<number[] | null> {
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

async function rankCandidates(
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

async function coldStartFallback(
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

// --- Public interface ---

export async function getRecommendations(options: RecommendationOptions): Promise<RecommendationResult> {
  const { userId, limit, excludeIds } = options;

  const signalIds = await gatherSignalIds(userId);
  const queryVector = await computeTasteProfile(signalIds);

  if (!queryVector) {
    return coldStartFallback(userId, excludeIds, limit);
  }

  return rankCandidates(userId, queryVector, signalIds, excludeIds, limit);
}

export async function getDailyMix(
  userId: string,
  limit: number = DEFAULT_DAILY_LIMIT,
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
