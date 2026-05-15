import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { getTopMoods } from "@/lib/songs";
import { anonRoute } from "@/lib/route-handler";

export const GET = anonRoute(
  async () => {
    const moods = await getTopMoods();

    return NextResponse.json(
      { moods },
      { headers: { "Cache-Control": CacheControl.publicShort } },
    );
  },
  { rateLimit: { action: "moods", limit: 30, windowMs: 60_000 } },
);
