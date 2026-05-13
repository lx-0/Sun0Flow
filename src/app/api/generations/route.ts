import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { queryGenerations } from "@/lib/songs";
import { zEnumParam, zTrimmedParam } from "@/lib/query-params";

const generationsQuery = z.object({
  status: zTrimmedParam,
  source: zTrimmedParam,
  q: zTrimmedParam,
  dateFrom: zTrimmedParam,
  dateTo: zTrimmedParam,
  sortBy: zEnumParam(["newest", "oldest"] as const, "newest"),
  cursor: zTrimmedParam,
});

export const GET = authRoute<Record<string, never>, undefined, z.infer<typeof generationsQuery>>(async (_request, { auth, query }) => {
  const { status, source, q, dateFrom, dateTo, sortBy, cursor } = query;

  const result = await queryGenerations(auth.userId, {
    status: status ?? "",
    source: source ?? "",
    q: q ?? "",
    dateFrom: dateFrom ?? "",
    dateTo: dateTo ?? "",
    sortBy,
    cursor: cursor ?? "",
  });

  return NextResponse.json(result);
}, { route: "/api/generations", query: generationsQuery });
