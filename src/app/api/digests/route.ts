import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute(async (request, { auth }) => {
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10)));
  const skip = (page - 1) * limit;

  const [digests, total] = await Promise.all([
    prisma.inspirationDigest.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: { id: true, title: true, items: true, createdAt: true },
    }),
    prisma.inspirationDigest.count({ where: { userId: auth.userId } }),
  ]);

  return NextResponse.json({
    digests,
    total,
    hasMore: skip + digests.length < total,
  });
}, { route: "/api/digests" });
