import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { findSimilarByEmbedding } from "@/lib/recommendations";
import { zLimitParam } from "@/lib/query-params";

const similarQuery = z.object({
  songId: z.string().min(1),
  limit: zLimitParam(5, 20),
});

export const GET = authRoute<
  Record<string, never>,
  undefined,
  z.infer<typeof similarQuery>
>(
  async (_request, { auth, query }) => {
    const result = await findSimilarByEmbedding(
      query.songId,
      auth.userId,
      query.limit,
    );
    if (result === null) {
      return NextResponse.json({ songs: [], total: 0 });
    }
    return NextResponse.json(result);
  },
  { route: "/api/recommendations/similar", query: similarQuery },
);
