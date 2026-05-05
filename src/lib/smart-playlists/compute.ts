import { prisma } from "@/lib/prisma";
import { computeCentroid } from "@/lib/embeddings";
import type { SmartPlaylistType } from "./types";
import { SMART_PLAYLIST_SIZE } from "./types";
import { rankBySimilarity } from "./rank-by-similarity";

export async function computeSmartPlaylistSongs(
  userId: string,
  type: SmartPlaylistType,
  meta: Record<string, string> | null,
): Promise<string[]> {
  switch (type) {
    case "top_hits":
      return computeTopHits(userId);
    case "new_this_week":
      return computeNewThisWeek(userId);
    case "mood":
      return computeMood(userId, meta?.mood ?? "chill");
    case "similar_to": {
      const sourceSongId = meta?.sourceSongId;
      if (!sourceSongId) return [];
      return computeSimilarTo(userId, sourceSongId);
    }
    default:
      return [];
  }
}

async function computeTopHits(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.playHistory.groupBy({
    by: ["songId"],
    where: { userId, playedAt: { gte: since } },
    _count: { songId: true },
    orderBy: { _count: { songId: "desc" } },
    take: SMART_PLAYLIST_SIZE,
  });

  if (rows.length === 0) {
    const fallback = await prisma.song.findMany({
      where: { userId, generationStatus: "ready", archivedAt: null },
      orderBy: { playCount: "desc" },
      take: SMART_PLAYLIST_SIZE,
      select: { id: true },
    });
    return fallback.map((s) => s.id);
  }

  return rows.map((r) => r.songId);
}

async function computeNewThisWeek(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const songs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      archivedAt: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: SMART_PLAYLIST_SIZE,
    select: { id: true },
  });
  return songs.map((s) => s.id);
}

async function computeMood(userId: string, mood: string): Promise<string[]> {
  const songs = await prisma.song.findMany({
    where: {
      userId,
      generationStatus: "ready",
      archivedAt: null,
      tags: { contains: mood, mode: "insensitive" },
    },
    orderBy: { playCount: "desc" },
    take: SMART_PLAYLIST_SIZE,
    select: { id: true },
  });
  return songs.map((s) => s.id);
}

async function computeSimilarTo(
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
