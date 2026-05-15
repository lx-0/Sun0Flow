import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCentroid, cosineSimilarity, parseEmbeddingVector } from "@/lib/embeddings";
import { gatherUserSignals } from "@/lib/user-signals";
import { formatSong, SONG_SELECT_FIELDS, type RecommendationResult } from "./format";

export interface ScoredSongId {
  songId: string;
  score: number;
}

const SIGNAL_SONGS_LIMIT = 30;
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

export async function gatherSignalIds(userId: string): Promise<Set<string>> {
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

export async function computeTasteProfile(signalIds: Set<string>): Promise<number[] | null> {
  if (signalIds.size === 0) return null;

  const signalEmbeddings = await prisma.songEmbedding.findMany({
    where: { songId: { in: Array.from(signalIds) } },
    select: { embedding: true },
  });

  const vectors = signalEmbeddings
    .map((e) => parseEmbeddingVector(e.embedding))
    .filter((v): v is number[] => v !== null);

  return computeCentroid(vectors);
}

export async function rankCandidates(
  userId: string,
  queryVector: number[],
  signalIds: Set<string>,
  excludeIds: Set<string>,
  limit: number,
): Promise<RecommendationResult> {
  const scored = await scoreByEmbedding(
    queryVector,
    {
      song: { userId, generationStatus: "ready", archivedAt: null },
      songId: { notIn: [...Array.from(signalIds), ...Array.from(excludeIds)] },
    },
    limit,
  );

  if (scored.length === 0) {
    return coldStartFallback(userId, excludeIds, limit);
  }

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

export async function coldStartFallback(
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
