import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getRateLimitStatus } from "@/lib/rate-limit";

export const GET = authRoute(async (_request, { auth }) => {
  const { status } = await getRateLimitStatus(auth.userId);
  return NextResponse.json(status);
});
