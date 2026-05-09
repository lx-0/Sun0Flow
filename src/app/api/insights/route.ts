import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getInsights } from "@/lib/insights";

export const GET = authRoute(async (_request, { auth }) => {
  const insights = await getInsights(auth.userId);
  return NextResponse.json(insights);
}, { route: "/api/insights" });
