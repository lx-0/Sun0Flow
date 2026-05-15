import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { listReports } from "@/lib/moderation";
import { zEnumParam, zPageParam } from "@/lib/query-params";

const reportsQuery = z.object({
  status: zEnumParam(["pending", "actioned", "dismissed", "all"] as const, "pending"),
  page: zPageParam(1),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof reportsQuery>>(async (_request, { query }) => {
  const { status, page } = query;

  const result = await listReports({ status, page });
  return NextResponse.json(result);
}, { route: "/api/admin/reports", query: reportsQuery });
