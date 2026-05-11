import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getDailyMix } from "@/lib/recommendations";

export const GET = authRoute(async (_request, { auth }) => {
  const result = await getDailyMix(auth.userId);
  return NextResponse.json(result);
}, { route: "/api/recommendations/daily" });
