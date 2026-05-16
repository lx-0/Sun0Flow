import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { withTiming } from "@/lib/timing";
import { findSimilarByEmbedding } from "@/lib/recommendations";
import { similarRecommendationsQuerySchema } from "@/lib/recommendations/request";

export const GET = withTiming("/api/recommendations/similar", authRoute(
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
  { route: "/api/recommendations/similar", query: similarRecommendationsQuerySchema },
));
