import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { getRelatedSongs } from "@/lib/recommendations";

const RELATED_LIMIT = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "8", 10) || 8,
      RELATED_LIMIT
    );

    const key = cacheKey("related-songs", id, String(limit));
    const result = await cached(
      key,
      () => getRelatedSongs(id, limit),
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result.songs, total: result.songs.length, source: result.source });
  } catch (error) {
    logServerError("related-songs", error, { route: "/api/songs/[id]/related" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
