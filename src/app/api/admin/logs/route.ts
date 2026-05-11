import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";

export const GET = adminRoute(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

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
}, { route: "/api/admin/logs" });
