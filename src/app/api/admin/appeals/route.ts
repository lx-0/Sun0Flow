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

  const [appeals, total] = await Promise.all([
    prisma.appeal.findMany({
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
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
