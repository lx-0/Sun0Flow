import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { cosineSimilarity } from "@/lib/embeddings";
import { withTiming } from "@/lib/timing";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const CANDIDATES_LIMIT = 500;

async function handleGET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const params = request.nextUrl.searchParams;
    const songId = params.get("songId");
    if (!songId) {
      return NextResponse.json(
        { error: "songId query parameter is required", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    const limit = Math.min(
      parseInt(params.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );

    const key = cacheKey("similar-embeddings-v1", userId, songId, String(limit));

    const result = await cached(
      key,
      async () => {
        const targetEmbedding = await prisma.songEmbedding.findUnique({
          where: { songId },
          select: { embedding: true },
        });

        if (!targetEmbedding) {
          return null;
        }

        const queryVector = targetEmbedding.embedding as unknown as number[];
        if (!Array.isArray(queryVector) || queryVector.length === 0) {
          return null;
        }

        const candidateEmbeddings = await prisma.songEmbedding.findMany({
          where: {
            songId: { not: songId },
            song: {
              userId,
              generationStatus: "ready",
              archivedAt: null,
            },
          },
          select: {
            songId: true,
            embedding: true,
          },
          take: CANDIDATES_LIMIT,
        });

        if (candidateEmbeddings.length === 0) {
          return { songs: [], total: 0 };
        }

        const scored = candidateEmbeddings
          .map((e) => ({
            songId: e.songId,
            score: cosineSimilarity(queryVector, e.embedding as unknown as number[]),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        const topIds = scored.map((s) => s.songId);
        const scoreMap = new Map(scored.map((s) => [s.songId, s.score]));

        const songs = await prisma.song.findMany({
          where: { id: { in: topIds } },
          select: {
            id: true,
            title: true,
            tags: true,
            imageUrl: true,
            duration: true,
            audioUrl: true,
            createdAt: true,
          },
        });

        const songMap = new Map(songs.map((s) => [s.id, s]));
        const orderedSongs = topIds
          .map((id) => {
            const s = songMap.get(id);
            if (!s) return null;
            return {
              id: s.id,
              title: s.title,
              tags: s.tags,
              imageUrl: s.imageUrl,
              duration: s.duration,
              audioUrl: s.audioUrl,
              createdAt: s.createdAt.toISOString(),
              score: scoreMap.get(id) ?? 0,
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);

        return { songs: orderedSongs, total: orderedSongs.length };
      },
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ songs: [], total: 0 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logServerError("similar-embeddings", error, { route: "/api/recommendations/similar" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export const GET = withTiming("/api/recommendations/similar", handleGET);
