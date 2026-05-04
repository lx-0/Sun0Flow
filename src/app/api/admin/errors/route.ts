import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const skip = (page - 1) * limit;

  const [errors, total] = await Promise.all([
    prisma.errorReport.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    prisma.errorReport.count(),
  ]);

  return NextResponse.json({ errors, total, page, limit });
}
