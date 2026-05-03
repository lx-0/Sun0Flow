import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { getDailyMix } from "@/lib/recommendations";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
    const key = cacheKey("daily-recommendations", userId, String(hourBucket));

    const result = await cached(
      key,
      () => getDailyMix(userId),
      CacheTTL.RECOMMENDATIONS,
    );

    return NextResponse.json(result);
  } catch (error) {
    logServerError("daily-recommendations", error, { route: "/api/recommendations/daily" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
