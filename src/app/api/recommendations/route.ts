import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getRecommendations } from "@/lib/recommendations";
import { zLimitParam, zCsvParam } from "@/lib/query-params";

const recommendationsQuery = z.object({
  limit: zLimitParam(20, 50),
  exclude: zCsvParam,
});

export const GET = authRoute<
  Record<string, never>,
  undefined,
  z.infer<typeof recommendationsQuery>
>(
  async (_request, { auth, query }) => {
    const result = await getRecommendations({
      userId: auth.userId,
      limit: query.limit,
      excludeIds: new Set(query.exclude),
    });
    return NextResponse.json(result);
  },
  { route: "/api/recommendations", query: recommendationsQuery },
);
