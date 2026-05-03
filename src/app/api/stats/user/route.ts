import { NextRequest, NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getUserStats } from "@/lib/user-stats";

export const GET = authRoute(async (_request: NextRequest, { auth }) => {
  const stats = await getUserStats(auth.userId);
  return NextResponse.json(stats);
}, { route: "/api/stats/user" });
