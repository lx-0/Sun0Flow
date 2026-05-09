import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { findSimilarByEmbedding } from "@/lib/recommendations";
import { withTiming } from "@/lib/timing";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

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
      () => findSimilarByEmbedding(songId, userId, limit),
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
