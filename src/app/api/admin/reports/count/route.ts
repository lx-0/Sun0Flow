import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { pendingReportCount } from "@/lib/moderation";

export const GET = adminRoute(async (_request, _ctx) => {
  const pending = await pendingReportCount();
  return NextResponse.json({ pending });
}, { route: "/api/admin/reports/count" });
