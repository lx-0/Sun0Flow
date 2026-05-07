import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getSongAnalytics } from "@/lib/analytics-data";

export const GET = authRoute<{ songId: string }>(async (_request, { auth, params }) => {
  const result = await getSongAnalytics(auth.userId, params.songId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json(result.data);
});
