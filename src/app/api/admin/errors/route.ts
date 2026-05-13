import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { zPaginationQuery } from "@/lib/query-params";

const errorsQuery = zPaginationQuery(50, 100);

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof errorsQuery>>(async (_request, { query }) => {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const [errors, total] = await Promise.all([
    prisma.errorReport.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.errorReport.count(),
  ]);

  return NextResponse.json({ errors, total, page, limit });
}, { route: "/api/admin/errors", query: errorsQuery });
