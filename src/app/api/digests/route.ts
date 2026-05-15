import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { zPageParam, zLimitParam } from "@/lib/query-params";

const digestsQuery = z.object({
  page: zPageParam(),
  limit: zLimitParam(10, 50),
});

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const skip = (query.page - 1) * query.limit;

    const [digests, total] = await Promise.all([
      prisma.inspirationDigest.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        select: { id: true, title: true, items: true, createdAt: true },
      }),
      prisma.inspirationDigest.count({ where: { userId: auth.userId } }),
    ]);

    return NextResponse.json({
      digests,
      total,
      hasMore: skip + digests.length < total,
    });
  },
  { route: "/api/digests", query: digestsQuery },
);
