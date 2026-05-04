import { NextRequest, NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { buildActivityFeed } from "@/lib/feed";

export const GET = authRoute(async (request: NextRequest, { auth }) => {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const result = await buildActivityFeed(auth.userId, page);
  return NextResponse.json(result);
});
