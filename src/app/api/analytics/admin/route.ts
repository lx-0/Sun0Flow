import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getAdminAnalytics } from "@/lib/analytics-data";
import { zEnumParam } from "@/lib/query-params";

const analyticsQuery = z.object({
  range: zEnumParam(["7d", "30d", "90d", "all"] as const, "30d"),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof analyticsQuery>>(async (_request, { query }) => {
  const { range } = query;
  const data = await getAdminAnalytics(range);
  return NextResponse.json(data);
}, { route: "/api/analytics/admin", query: analyticsQuery });
