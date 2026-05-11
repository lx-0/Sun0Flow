import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";

export const GET = adminRoute(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "pending";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const skip = pageSkip(page, DEFAULT_PAGE_SIZE);

  const where = status === "all" ? {} : { status };

  const [appeals, total] = await Promise.all([
    prisma.appeal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: DEFAULT_PAGE_SIZE,
      include: {
        song: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            isHidden: true,
            reports: {
              where: { status: { in: ["pending", "actioned"] } },
              select: { reason: true, adminNote: true },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.appeal.count({ where }),
  ]);

  return NextResponse.json({
    appeals,
    ...offsetPagination(page, DEFAULT_PAGE_SIZE, total),
  });
}, { route: "/api/admin/appeals" });
