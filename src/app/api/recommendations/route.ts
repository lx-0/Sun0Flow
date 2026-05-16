import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { withTiming } from "@/lib/timing";
import { getRecommendations } from "@/lib/recommendations";
import { recommendationsQuerySchema } from "@/lib/recommendations/request";

export const GET = withTiming("/api/recommendations", authRoute(
  async (_request, { auth, query }) => {
    const result = await getRecommendations({
      userId: auth.userId,
      limit: query.limit,
      excludeIds: new Set(query.exclude),
    });
    return NextResponse.json(result);
  },
  { route: "/api/recommendations", query: recommendationsQuerySchema },
));
