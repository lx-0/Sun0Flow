import { z } from "zod";
import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { discoverSongs } from "@/lib/discovery";
import { anonRoute } from "@/lib/route-handler";
import {
  zPageParam,
  zIntParam,
  zTrimmedParam,
  zEnumParam,
} from "@/lib/query-params";

const discoverQuery = z.object({
  page: zPageParam(),
  sortBy: zEnumParam(
    ["newest", "highest_rated", "most_played"] as const,
    "newest",
  ),
  tag: zTrimmedParam,
  mood: zTrimmedParam,
  tempoMin: zIntParam,
  tempoMax: zIntParam,
});

export const GET = anonRoute(
  async (_request, { query }) => {
    const result = await discoverSongs({
      sortBy: query.sortBy,
      tag: query.tag,
      mood: query.mood,
      tempoMin: query.tempoMin ?? null,
      tempoMax: query.tempoMax ?? null,
      page: query.page,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  },
  {
    rateLimit: { action: "discover", limit: 30, windowMs: 60_000 },
    query: discoverQuery,
  },
);
