import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { listReports } from "@/lib/moderation";

export const GET = adminRoute(async (request) => {
  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "pending";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));

  const result = await listReports({ status, page });
  return NextResponse.json(result);
}, { route: "/api/admin/reports" });
