import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { getDailyMix } from "@/lib/recommendations";

export const GET = authRoute(async (_request, { auth }) => {
  const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
  const key = cacheKey("daily-recommendations", auth.userId, String(hourBucket));

  const result = await cached(
    key,
    () => getDailyMix(auth.userId),
    CacheTTL.RECOMMENDATIONS,
  );

  return NextResponse.json(result);
}, { route: "/api/recommendations/daily" });
