import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { discoverSongs } from "@/lib/discovery";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "discover", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const params = request.nextUrl.searchParams;
    const pageParam = parseInt(params.get("page") || "", 10);
    const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;
    const sortBy = (params.get("sortBy") || "newest") as "newest" | "highest_rated" | "most_played";
    const tag = params.get("tag")?.trim() || undefined;
    const mood = params.get("mood")?.trim() || undefined;
    const tempoMinParam = params.get("tempoMin");
    const tempoMaxParam = params.get("tempoMax");
    const tempoMin = tempoMinParam && !isNaN(parseInt(tempoMinParam, 10))
      ? parseInt(tempoMinParam, 10) : null;
    const tempoMax = tempoMaxParam && !isNaN(parseInt(tempoMaxParam, 10))
      ? parseInt(tempoMaxParam, 10) : null;

    const result = await discoverSongs({ sortBy, tag, mood, tempoMin, tempoMax, page });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  } catch (error) {
    logServerError("songs-discover", error, { route: "/api/songs/discover" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
