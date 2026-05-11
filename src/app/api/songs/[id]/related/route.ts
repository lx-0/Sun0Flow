import { NextResponse } from "next/server";
import { z } from "zod";
import { publicRoute } from "@/lib/route-handler";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { getRelatedSongs } from "@/lib/recommendations";
import { zLimitParam } from "@/lib/query-params";

const relatedQuery = z.object({ limit: zLimitParam(8, 8) });

export const GET = publicRoute<{ id: string }, undefined, z.infer<typeof relatedQuery>>(
  async (_request, { params, query }) => {
    const key = cacheKey("related-songs", params.id, String(query.limit));
    const result = await cached(
      key,
      () => getRelatedSongs(params.id, query.limit),
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result.songs, total: result.songs.length, source: result.source });
  },
  { query: relatedQuery, route: "/api/songs/[id]/related" }
);
