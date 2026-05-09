import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { getAlsoLiked } from "@/lib/recommendations";

const ALSO_LIKED_LIMIT = 8;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "8", 10) || 8,
      ALSO_LIKED_LIMIT
    );

    const key = cacheKey("also-liked", userId, id, String(limit));
    const result = await cached(
      key,
      () => getAlsoLiked(id, userId, limit),
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result, total: result.length });
  } catch (error) {
    logServerError("also-liked", error, { route: "/api/songs/[id]/also-liked" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
