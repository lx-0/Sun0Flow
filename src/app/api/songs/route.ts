import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import { querySongLibrary } from "@/lib/songs";
import { songsQuerySchema } from "@/lib/songs/request";

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await querySongLibrary({ userId: auth.userId, ...query });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  },
  { route: "/api/songs", query: songsQuerySchema },
);
