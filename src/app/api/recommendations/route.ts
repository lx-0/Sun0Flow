import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { cosineSimilarity, computeCentroid } from "@/lib/embeddings";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// How many of the user's most recent signal songs (favorites + high-rated + played) to use
const SIGNAL_SONGS_LIMIT = 30;
// How many candidate songs to score for similarity (pulled from user's library)
const CANDIDATES_LIMIT = 500;

/**
 * GET /api/recommendations
 *
 * Returns personalized song recommendations for the authenticated user,
 * computed via cosine similarity on OpenAI embeddings.
 *
 * Query params:
 *   limit  — number of results (default 20, max 50)
 *   exclude — comma-separated song IDs to exclude from results
 *
 * Algorithm:
 *   1. Gather "signal" songs: favorites, high-rated, recently played, recently generated
 *   2. Fetch their embeddings and compute a centroid (user taste profile)
 *   3. Fetch all other songs' embeddings from the user's library
 *   4. Rank by cosine similarity to the centroid
 *   5. Cold-start: no signal → return popular/recent songs from the user's library
 *
 * Results are cached per-user for 1 hour (matches cron embedding refresh cadence).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(params.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const excludeParam = params.get("exclude") || "";
    const excludeIds = new Set(excludeParam.split(",").filter(Boolean));

    // Cache key buckets per hour so results refresh after the hourly embedding cron
    const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
    const key = cacheKey("recommendations-v1", userId, String(hourBucket), String(limit));

    const result = await cached(
      key,
      async () => {
        // --- Step 1: Collect signal song IDs ---
        const [favorites, highRated, recentPlayed, recentGenerated] = await Promise.all([
          // Favorited songs
          prisma.favorite.findMany({
            where: { userId },
            select: { songId: true },
            orderBy: { createdAt: "desc" },
            take: SIGNAL_SONGS_LIMIT,
          }),
          // High-rated songs (4+)
          prisma.song.findMany({
            where: { userId, rating: { gte: 4 }, archivedAt: null },
            select: { id: true },
            orderBy: { rating: "desc" },
            take: SIGNAL_SONGS_LIMIT,
          }),
          // Recently played songs
          prisma.playHistory.findMany({
            where: { userId },
            select: { songId: true },
            orderBy: { playedAt: "desc" },
            take: SIGNAL_SONGS_LIMIT,
          }),
          // Recently generated songs (own creation history)
          prisma.song.findMany({
            where: { userId, generationStatus: "ready", archivedAt: null },
            select: { id: true },
            orderBy: { createdAt: "desc" },
            take: SIGNAL_SONGS_LIMIT,
          }),
        ]);

        const signalIds = new Set<string>([
          ...favorites.map((f) => f.songId),
          ...highRated.map((s) => s.id),
          ...recentPlayed.map((p) => p.songId),
          ...recentGenerated.map((s) => s.id),
        ]);

        // --- Step 2: Fetch signal embeddings and compute centroid ---
        let queryVector: number[] | null = null;

        if (signalIds.size > 0) {
          const signalEmbeddings = await prisma.songEmbedding.findMany({
            where: { songId: { in: Array.from(signalIds) } },
            select: { embedding: true },
          });

          const vectors = signalEmbeddings
            .map((e) => e.embedding as unknown as number[])
            .filter((v) => Array.isArray(v) && v.length > 0);

          queryVector = computeCentroid(vectors);
        }

        // --- Step 3: Cold-start fallback ---
        if (!queryVector) {
          // No embeddings available — return popular/recent songs
          const coldStartSongs = await prisma.song.findMany({
            where: {
              userId,
              generationStatus: "ready",
              archivedAt: null,
              id: { notIn: Array.from(excludeIds) },
            },
            orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
            take: limit,
            select: songSelectFields,
          });

          return {
            songs: coldStartSongs.map(formatSong),
            total: coldStartSongs.length,
            strategy: "cold_start",
            generatedAt: new Date().toISOString(),
          };
        }

        // --- Step 4: Score candidate songs by cosine similarity ---
        // Fetch candidates that are NOT already in the signal set
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
          // All songs are in the signal set or have no embeddings — fall back gracefully
          const fallback = await prisma.song.findMany({
            where: {
              userId,
              generationStatus: "ready",
              archivedAt: null,
              id: { notIn: Array.from(excludeIds) },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: songSelectFields,
          });

          return {
            songs: fallback.map(formatSong),
            total: fallback.length,
            strategy: "fallback_no_candidates",
            generatedAt: new Date().toISOString(),
          };
        }

        // Rank by similarity
        const scored = candidateEmbeddings
          .map((e) => ({
            songId: e.songId,
            score: cosineSimilarity(queryVector!, e.embedding as unknown as number[]),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        const topIds = scored.map((s) => s.songId);

        // Fetch full song records for the top results
        const songs = await prisma.song.findMany({
          where: { id: { in: topIds } },
          select: songSelectFields,
        });

        // Re-sort to match ranking order
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
      },
      CacheTTL.RECOMMENDATIONS
    );

    return NextResponse.json(result);
  } catch (error) {
    logServerError("recommendations", error, { route: "/api/recommendations" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const songSelectFields = {
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

function formatSong(s: SongRow) {
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
