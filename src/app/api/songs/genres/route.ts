import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { getTopGenres } from "@/lib/songs";
import { anonRoute } from "@/lib/route-handler";

export const GET = anonRoute(
  async () => {
    const genres = await getTopGenres();

    return NextResponse.json(
      { genres },
      { headers: { "Cache-Control": CacheControl.publicShort } },
    );
  },
  { rateLimit: { action: "genres", limit: 30, windowMs: 60_000 } },
);
