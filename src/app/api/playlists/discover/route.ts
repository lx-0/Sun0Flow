import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { rateLimited, internalError } from "@/lib/api-error";
import { withTiming } from "@/lib/timing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { discoverPlaylists } from "@/lib/discovery";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

async function handleGET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "playlist-discover", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;
    const pageParam = parseInt(params.get("page") || "", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const sortParam = params.get("sort") || "trending";
    const sort = (["trending", "recent", "popular"].includes(sortParam) ? sortParam : "trending") as "trending" | "recent" | "popular";
    const genre = params.get("genre")?.trim() || undefined;

    const result = await discoverPlaylists({ sort, genre, page, limit });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  } catch (error) {
    logServerError("playlists-discover", error, { route: "/api/playlists/discover" });
    return internalError();
  }
}

export const GET = withTiming("/api/playlists/discover", handleGET);
