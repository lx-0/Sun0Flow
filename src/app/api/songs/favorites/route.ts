import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { CacheControl } from "@/lib/cache";
import { listFavorites } from "@/lib/songs";
import {
  zTrimmedParam,
  zLimitParam,
  zCursorParam,
  zEnumParam,
} from "@/lib/query-params";

const favoritesQuery = z.object({
  q: zTrimmedParam,
  status: zTrimmedParam,
  sortBy: zEnumParam(
    ["recently_liked", "newest", "oldest", "title_az"] as const,
    "recently_liked",
  ),
  limit: zLimitParam(20, 100),
  cursor: zCursorParam,
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await listFavorites({
      userId: auth.userId,
      search: query.q,
      status: query.status,
      sortBy: query.sortBy,
      limit: query.limit,
      cursor: query.cursor,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  },
  { route: "/api/songs/favorites", query: favoritesQuery },
);
