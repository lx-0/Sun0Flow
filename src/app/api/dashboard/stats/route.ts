import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { cached, cacheKey, CacheTTL, CacheControl } from "@/lib/cache";
import { withTiming } from "@/lib/timing";
import { getDashboardStats } from "@/lib/dashboard-stats";

async function handleGET(request: NextRequest) {
  const { userId, error: authError } = await resolveUser(request);
  if (authError) return authError;

  const stats = await cached(
    cacheKey("dashboard-stats", userId),
    () => getDashboardStats(userId),
    CacheTTL.DASHBOARD_STATS,
  );

  return NextResponse.json(stats, {
    headers: { "Cache-Control": CacheControl.privateShort },
  });
}

export const GET = withTiming("/api/dashboard/stats", handleGET);
