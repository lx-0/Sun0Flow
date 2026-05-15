import { z } from "zod";
import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { queryPublicSongs, type PublicSongSort } from "@/lib/songs";
import { anonRoute } from "@/lib/route-handler";
import { zTrimmedParam, zIntParam, zEnumParam } from "@/lib/query-params";

const publicSongsQuery = z.object({
  q: zTrimmedParam,
  genre: zTrimmedParam,
  mood: zTrimmedParam,
  sort: zEnumParam(["newest", "popular", "trending"] as const, "newest"),
  limit: zIntParam,
  offset: zIntParam,
});

export const GET = anonRoute(
  async (_request, { query }) => {
    const result = await queryPublicSongs({
      search: query.q || undefined,
      genre: query.genre || undefined,
      mood: query.mood || undefined,
      sort: query.sort as PublicSongSort,
      limit: query.limit || undefined,
      offset: query.offset || undefined,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  },
  {
    rateLimit: { action: "public_songs", limit: 100, windowMs: 60_000 },
    query: publicSongsQuery,
  },
);
