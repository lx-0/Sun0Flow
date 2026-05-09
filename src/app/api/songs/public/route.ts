import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { rateLimited } from "@/lib/api-error";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { queryPublicSongs, type PublicSongSort } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 100;

const VALID_SORTS = new Set<PublicSongSort>(["newest", "popular", "trending"]);

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "public_songs", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;
    const sortParam = params.get("sort") || "newest";

    const result = await queryPublicSongs({
      search: params.get("q")?.trim() || undefined,
      genre: params.get("genre")?.trim() || undefined,
      mood: params.get("mood")?.trim() || undefined,
      sort: VALID_SORTS.has(sortParam as PublicSongSort)
        ? (sortParam as PublicSongSort)
        : "newest",
      limit: parseInt(params.get("limit") || "", 10) || undefined,
      offset: parseInt(params.get("offset") || "", 10) || undefined,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  } catch (error) {
    logServerError("songs-public", error, { route: "/api/songs/public" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
