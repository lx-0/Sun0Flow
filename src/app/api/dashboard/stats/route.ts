import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { cached, cacheKey, CacheTTL, CacheControl } from "@/lib/cache";
import { withTiming } from "@/lib/timing";
import { getDashboardStats } from "@/lib/analytics-data";

const handleGET = authRoute(async (_request, { auth }) => {
  const stats = await cached(
    cacheKey("dashboard-stats", auth.userId),
    () => getDashboardStats(auth.userId),
    CacheTTL.DASHBOARD_STATS,
  );

  return NextResponse.json(stats, {
    headers: { "Cache-Control": CacheControl.privateShort },
  });
}, { route: "/api/dashboard/stats" });

export const GET = withTiming("/api/dashboard/stats", handleGET);
