import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { recordPlay } from "@/lib/analytics-data";

export const POST = authRoute(async (request, { auth }) => {
  const { songId, durationSec } = await request.json();
  const result = await recordPlay(auth.userId, songId, durationSec);

  if (!result.ok) return resultResponse(result);

  const status = result.data.eventId ? 201 : 200;
  return NextResponse.json(result.data, { status });
});
