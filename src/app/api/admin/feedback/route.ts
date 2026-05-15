import { z } from "zod";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { zIntParam, zPageParam, zTrimmedParam } from "@/lib/query-params";

const feedbackQuery = z.object({
  category: zTrimmedParam,
  score: zIntParam,
  page: zPageParam(1),
});

export const GET = adminRoute<Record<string, never>, undefined, z.infer<typeof feedbackQuery>>(async (_request, { query }) => {
  const { category, score, page } = query;
  const skip = pageSkip(page, DEFAULT_PAGE_SIZE);

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (typeof score === "number") where.score = score;

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
}, { route: "/api/admin/feedback", query: feedbackQuery });
