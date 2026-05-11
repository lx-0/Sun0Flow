import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";

export const GET = adminRoute(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const scoreParam = params.get("score");
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const skip = pageSkip(page, DEFAULT_PAGE_SIZE);

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (scoreParam) {
    const score = parseInt(scoreParam, 10);
    if (!isNaN(score)) where.score = score;
  }

  const [feedbacks, total] = await Promise.all([
    prisma.userFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: DEFAULT_PAGE_SIZE,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.userFeedback.count({ where }),
  ]);

  return NextResponse.json({
    feedbacks,
    ...offsetPagination(page, DEFAULT_PAGE_SIZE, total),
  });
}, { route: "/api/admin/feedback" });
