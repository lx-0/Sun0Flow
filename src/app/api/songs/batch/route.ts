import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { executeBatch } from "@/lib/songs/batch";

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await executeBatch(auth.userId, body);

  if (!result.ok) return resultResponse(result);

  return NextResponse.json({
    action: result.action,
    affected: result.affected,
    songIds: result.songIds,
  });
}, { route: "/api/songs/batch" });
