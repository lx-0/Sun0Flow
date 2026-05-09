import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, offsetPagination, pageSkip } from "@/lib/pagination";
import { buildDiscoverableFilter } from "@/lib/songs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where: {
          ...buildDiscoverableFilter(),
          userId: user.id,
        },
        orderBy: { createdAt: "desc" },
        skip: pageSkip(page, DEFAULT_PAGE_SIZE),
        take: DEFAULT_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          audioUrl: true,
          duration: true,
          tags: true,
          publicSlug: true,
          playCount: true,
          createdAt: true,
        },
      }),
      prisma.song.count({
        where: {
          ...buildDiscoverableFilter(),
          userId: user.id,
        },
      }),
    ]);

    return NextResponse.json({
      songs,
      pagination: offsetPagination(page, DEFAULT_PAGE_SIZE, total),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
