import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";
import { zPaginationQuery } from "@/lib/query-params";

const logsQuery = zPaginationQuery(50, 100);

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof logsQuery>>(async (_request, { query }) => {
  const { page, limit } = query;

  const [logs, total] = await Promise.all([
    prisma.adminLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, limit),
      take: limit,
      include: {
        admin: { select: { name: true, email: true } },
      },
    }),
    prisma.adminLog.count(),
  ]);

  return NextResponse.json({
    logs,
    ...offsetPagination(page, limit, total),
  });
}, { route: "/api/admin/logs", query: logsQuery });
