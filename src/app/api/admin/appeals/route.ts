import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { zEnumParam, zPageParam } from "@/lib/query-params";

const appealsQuery = z.object({
  status: zEnumParam(["pending", "approved", "rejected", "all"] as const, "pending"),
  page: zPageParam(1),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof appealsQuery>>(async (_request, { query }) => {
  const { status, page } = query;
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
}, { route: "/api/admin/appeals", query: appealsQuery });
