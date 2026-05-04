import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const filter = searchParams.get("filter") ?? "all"; // all | flagged | public

  const where =
    filter === "flagged"
      ? { isHidden: true }
      : filter === "public"
      ? { isPublic: true, isHidden: false }
      : {};

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      select: {
        id: true,
        title: true,
        generationStatus: true,
        isPublic: true,
        isHidden: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { reports: { where: { status: "pending" } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.song.count({ where }),
  ]);

  const result = songs.map((s) => ({
    id: s.id,
    title: s.title,
    generationStatus: s.generationStatus,
    isPublic: s.isPublic,
    isHidden: s.isHidden,
    createdAt: s.createdAt,
    creator: { id: s.user.id, name: s.user.name, email: s.user.email },
    pendingReports: s._count.reports,
  }));

  return NextResponse.json({
    songs: result,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
