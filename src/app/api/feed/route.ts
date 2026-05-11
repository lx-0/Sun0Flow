import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { buildActivityFeed } from "@/lib/activity";
import { zPageParam } from "@/lib/query-params";

const feedQuery = z.object({
  page: zPageParam(),
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await buildActivityFeed(auth.userId, query.page);
    return NextResponse.json(result);
  },
  { query: feedQuery },
);
