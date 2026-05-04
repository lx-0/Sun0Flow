import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        prompt: true,
        generationStatus: true,
        audioUrl: true,
        duration: true,
        createdAt: true,
      },
    }),
    prisma.song.count({ where: { userId: id } }),
  ]);

  return NextResponse.json({
    songs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
