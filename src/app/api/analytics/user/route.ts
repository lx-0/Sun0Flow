import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getUserDashboardStats } from "@/lib/analytics-data";

export const GET = authRoute(async (_request, { auth }) => {
  const data = await getUserDashboardStats(auth.userId);
  return NextResponse.json(data);
});
