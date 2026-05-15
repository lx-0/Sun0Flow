import { z } from "zod";
import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { discoverPlaylists } from "@/lib/discovery";
import { anonRoute } from "@/lib/route-handler";
import { zPageParam, zLimitParam, zTrimmedParam, zEnumParam } from "@/lib/query-params";

const playlistDiscoverQuery = z.object({
  sort: zEnumParam(["trending", "recent", "popular"] as const, "trending"),
  genre: zTrimmedParam,
  page: zPageParam(),
  limit: zLimitParam(20, 100),
});

export const GET = anonRoute(
  async (_request, { query }) => {
    const result = await discoverPlaylists(query);

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  },
  {
    rateLimit: { action: "playlist-discover", limit: 30, windowMs: 60_000 },
    query: playlistDiscoverQuery,
  },
);
