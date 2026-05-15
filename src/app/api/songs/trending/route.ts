import { z } from "zod";
import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { trendingSongs } from "@/lib/discovery";
import { anonRoute } from "@/lib/route-handler";
import { zLimitParam, zOffsetParam, zTrimmedParam, zEnumParam } from "@/lib/query-params";

const trendingQuery = z.object({
  sort: zEnumParam(["trending", "popular"] as const, "trending"),
  limit: zLimitParam(20, 100),
  offset: zOffsetParam(),
  genre: zTrimmedParam,
  mood: zTrimmedParam,
});

export const GET = anonRoute(
  async (_request, { query }) => {
    const result = await trendingSongs(query);

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  },
  {
    rateLimit: { action: "trending", limit: 60, windowMs: 60_000 },
    query: trendingQuery,
  },
);
