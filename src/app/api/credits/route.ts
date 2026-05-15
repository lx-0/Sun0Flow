import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { getMonthlyCreditUsage } from "@/lib/credits";

export const GET = authRoute(async (_request, { auth }) => {
  const usage = await getMonthlyCreditUsage(auth.userId);
  return NextResponse.json(usage);
});
