import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { queryPublicSongs } from "@/lib/songs";
import { anonRoute } from "@/lib/route-handler";
import { publicSongsQuerySchema, toPublicSongsQuery } from "@/lib/songs/request";

export const GET = anonRoute(
  async (_request, { query }) => {
    const result = await queryPublicSongs(toPublicSongsQuery(query));

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.publicShort },
    });
  },
  {
    rateLimit: { action: "public_songs", limit: 100, windowMs: 60_000 },
    query: publicSongsQuerySchema,
  },
);
