import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getPromptQuality } from "@/lib/analytics-data";
import { zEnumParam } from "@/lib/query-params";

const promptQualityQuery = z.object({
  range: zEnumParam(["7d", "30d", "90d", "all"] as const, "30d"),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof promptQualityQuery>>(async (_request, { query }) => {
  const { range } = query;
  const data = await getPromptQuality(range);
  return NextResponse.json(data);
}, { route: "/api/analytics/prompt-quality", query: promptQualityQuery });
