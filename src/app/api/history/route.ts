import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { badRequest, notFound } from "@/lib/api-error";
import { zLimitParam, zCursorParam } from "@/lib/query-params";
import { listPlayHistory, recordPlay, clearHistory } from "@/lib/history";

const historyQuery = z.object({
  limit: zLimitParam(20, 50),
  cursor: zCursorParam,
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await listPlayHistory(auth.userId, query);
    return NextResponse.json(result);
  },
  { route: "/api/history", query: historyQuery },
);

export const POST = authRoute(
  async (request, { auth }) => {
    const body = await request.json();
    const { songId } = body;

    if (!songId || typeof songId !== "string") {
      return badRequest("songId is required");
    }

    const result = await recordPlay(auth.userId, songId);

    switch (result.status) {
      case "not_found":
        return notFound("Song not found");
      case "deduped":
        return NextResponse.json({ skipped: true }, { status: 200 });
      case "recorded":
        return NextResponse.json({ entry: result.entry }, { status: 201 });
    }
  },
  { route: "/api/history" },
);

export const DELETE = authRoute(
  async (_request, { auth }) => {
    await clearHistory(auth.userId);
    return NextResponse.json({ success: true });
  },
  { route: "/api/history" },
);
