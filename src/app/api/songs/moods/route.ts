import { NextRequest, NextResponse } from "next/server";
import { logServerError } from "@/lib/error-logger";
import { CacheControl } from "@/lib/cache";
import { acquireAnonRateLimitSlot } from "@/lib/rate-limit";
import { getTopMoods } from "@/lib/songs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { acquired } = await acquireAnonRateLimitSlot(ip, "moods", RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!acquired) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const moods = await getTopMoods();

    return NextResponse.json(
      { moods },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch (error) {
    logServerError("songs-moods", error, { route: "/api/songs/moods" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
