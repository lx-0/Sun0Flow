import { NextRequest, NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { offsetPagination, pageSkip } from "@/lib/pagination";

export const GET = adminRoute<{ id: string }>(async (request: NextRequest, { params }) => {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where: { userId: params.id },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, limit),
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
    prisma.song.count({ where: { userId: params.id } }),
  ]);

  return NextResponse.json({
    songs,
    ...offsetPagination(page, limit, total),
  });
}, { route: "/api/admin/users/[id]/history" });
