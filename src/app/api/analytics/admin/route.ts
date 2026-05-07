import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getAdminAnalytics } from "@/lib/analytics-data";

export const GET = adminRoute(async (request) => {
  const range = request.nextUrl.searchParams.get("range") || "30d";
  const data = await getAdminAnalytics(range);
  return NextResponse.json(data);
});
