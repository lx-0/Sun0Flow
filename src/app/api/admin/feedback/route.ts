import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const category = params.get("category");
  const scoreParam = params.get("score");
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

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
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.userFeedback.count({ where }),
  ]);

  return NextResponse.json({
    feedbacks,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
