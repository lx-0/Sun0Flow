import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { withTiming } from "@/lib/timing";
import { getRecommendations } from "@/lib/recommendations";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

async function handleGET(request: NextRequest) {
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

    const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
    const key = cacheKey("recommendations-v1", userId, String(hourBucket), String(limit));

    const result = await cached(
      key,
      () => getRecommendations({ userId, limit, excludeIds }),
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

export const GET = withTiming("/api/recommendations", handleGET);
