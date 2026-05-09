import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/error-logger";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";
import { withTiming } from "@/lib/timing";
import {
  buildAnonymousFeed,
  buildPersonalizedFeed,
  paginate,
} from "@/lib/feed";

/**
 * GET /api/discover
 *
 * Personalized feed for the discover page.
 *
 * For authenticated users:
 *   - Songs from followed users (recent public releases)
 *   - Trending public songs
 *   - New public releases
 *   - Each item is ranked by a taste-affinity score when the user has activity history
 *
 * For anonymous users or users with no history:
 *   - Fallback: trending + new releases
 *
 * Query params:
 *   page   — page number (default 1)
 *   tag    — genre tag filter
 *   mood   — mood tag filter
 */

async function handleGET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const pageParam = parseInt(params.get("page") || "1", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;

    const tag = params.get("tag")?.trim() || "";
    const mood = params.get("mood")?.trim() || "";
    const filters = { tag: tag || undefined, mood: mood || undefined };

    const session = await auth();
    const userId = session?.user?.id ?? null;

    if (!userId) {
      const key = cacheKey("discover-anon-v1", tag || "any", mood || "any");
      const items = await cached(key, () => buildAnonymousFeed(filters), CacheTTL.DISCOVER);
      return NextResponse.json(
        { ...paginate(items, page), strategy: "trending_fallback" },
        { headers: { "Cache-Control": CacheControl.publicShort } }
      );
    }

    const hourBucket = Math.floor(Date.now() / (1000 * 60 * 5));
    const key = cacheKey(
      "discover-feed-v1",
      userId,
      tag || "any",
      mood || "any",
      String(hourBucket)
    );

    const { items, strategy } = await cached(
      key,
      () => buildPersonalizedFeed(userId, filters),
      CacheTTL.DISCOVER
    );

    const paged = paginate(items, page);

    return NextResponse.json(
      { ...paged, strategy },
      { headers: { "Cache-Control": CacheControl.privateShort } }
    );
  } catch (error) {
    logServerError("discover-feed", error, { route: "/api/discover" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export const GET = withTiming("/api/discover", handleGET);
