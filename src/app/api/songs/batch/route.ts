import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { executeBatch } from "@/lib/songs/batch";
import { executeBatchRequestSchema } from "@/lib/songs/batch-request";

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await executeBatch(auth.userId, body);

  if (!result.ok) return resultResponse(result);

  return NextResponse.json({
    action: result.action,
    affected: result.affected,
    songIds: result.songIds,
  });
}, { body: executeBatchRequestSchema, route: "/api/songs/batch" });
