import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { getTopGenres } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "genres", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const genres = await getTopGenres();

    return NextResponse.json(
      { genres },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch (error) {
    logServerError("songs-genres", error, { route: "/api/songs/genres" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
