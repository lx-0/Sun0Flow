import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { rateLimited, internalError } from "@/lib/api-error";
import { withTiming } from "@/lib/timing";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { trendingSongs } from "@/lib/discovery";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

async function handleGET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "trending", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Too many requests. Try again in a minute.", undefined, {
        "Retry-After": "60",
      });
    }

    const params = request.nextUrl.searchParams;
    const sort = params.get("sort") === "popular" ? "popular" as const : "trending" as const;
    const limitParam = parseInt(params.get("limit") || "", 10);
    const limit = !isNaN(limitParam) && limitParam >= 1 && limitParam <= 100 ? limitParam : 20;
    const offsetParam = parseInt(params.get("offset") || "", 10);
    const offset = !isNaN(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
    const genre = params.get("genre")?.trim() || undefined;
    const mood = params.get("mood")?.trim() || undefined;

    const result = await trendingSongs({ sort, genre, mood, limit, offset });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  } catch (error) {
    logServerError("songs-trending", error, { route: "/api/songs/trending" });
    return internalError();
  }
}

export const GET = withTiming("/api/songs/trending", handleGET);
