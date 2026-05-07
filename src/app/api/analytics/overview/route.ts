import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getUserOverview } from "@/lib/analytics-data";

export const GET = authRoute(async (_request, { auth }) => {
  const data = await getUserOverview(auth.userId);
  return NextResponse.json(data);
});
