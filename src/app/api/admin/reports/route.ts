import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "pending";
  const page = Math.max(1, parseInt(params.get("page") || "1", 10));
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = status === "all" ? {} : { status };

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        song: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            audioUrl: true,
            isHidden: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        reporter: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.report.count({ where }),
  ]);

  return NextResponse.json({
    reports,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
