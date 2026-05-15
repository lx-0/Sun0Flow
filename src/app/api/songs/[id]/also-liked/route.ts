import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getAlsoLiked } from "@/lib/recommendations";
import { zLimitParam } from "@/lib/query-params";

const alsoLikedQuery = z.object({
  limit: zLimitParam(8, 8),
});

export const GET = authRoute<{ id: string }, undefined, z.infer<typeof alsoLikedQuery>>(
  async (_request, { auth, params, query }) => {
    const result = await getAlsoLiked(params.id, auth.userId, query.limit);
    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ songs: result, total: result.length });
  },
  { route: "/api/songs/[id]/also-liked", query: alsoLikedQuery },
);
