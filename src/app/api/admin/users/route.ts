import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";
import { TIER_LIMITS } from "@/lib/billing";
import { zEnumParam, zPaginationQuery, zTrimmedParam } from "@/lib/query-params";

const usersQuery = zPaginationQuery(20, 100).extend({
  search: zTrimmedParam,
  sortBy: zEnumParam(["createdAt", "name", "email", "lastLoginAt", "generationCount"] as const, "createdAt"),
  order: zEnumParam(["asc", "desc"] as const, "desc"),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof usersQuery>>(async (_request, { query }) => {
  const { search, sortBy, order, page, limit } = query;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const orderBy: Record<string, string> = {};
  if (sortBy === "generationCount") {
    // Handled separately
  } else if (["createdAt", "name", "email", "lastLoginAt"].includes(sortBy)) {
    orderBy[sortBy] = order;
  } else {
    orderBy.createdAt = order;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isDisabled: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { songs: true } },
        subscription: {
          select: { tier: true, status: true },
        },
        creditUsages: {
          where: { createdAt: { gte: monthStart } },
          select: { creditCost: true },
        },
      },
      orderBy: Object.keys(orderBy).length > 0 ? orderBy : undefined,
      skip: pageSkip(page, limit),
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  const result = users.map((u) => {
    const tier = u.subscription?.tier ?? "free";
    const creditsUsed = u.creditUsages.reduce((sum, c) => sum + c.creditCost, 0);
    const creditBudget = TIER_LIMITS[tier]?.creditsPerMonth ?? TIER_LIMITS.free.creditsPerMonth;
    const creditBalance = Math.max(0, creditBudget - creditsUsed);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      isAdmin: u.isAdmin,
      isDisabled: u.isDisabled,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      generationCount: u._count.songs,
      planTier: tier,
      subscriptionStatus: u.subscription?.status ?? null,
      creditBalance,
      creditBudget,
    };
  });

  if (sortBy === "generationCount") {
    result.sort((a, b) =>
      order === "asc"
        ? a.generationCount - b.generationCount
        : b.generationCount - a.generationCount
    );
  }

  return NextResponse.json({
    users: result,
    ...offsetPagination(page, limit, total),
  });
}, { route: "/api/admin/users", query: usersQuery });
