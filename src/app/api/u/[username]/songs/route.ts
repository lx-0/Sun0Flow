import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SongFilters } from "@/lib/songs";

const PAGE_SIZE = 20;

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
          ...SongFilters.publicDiscovery(),
          userId: user.id,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
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
          ...SongFilters.publicDiscovery(),
          userId: user.id,
        },
      }),
    ]);

    return NextResponse.json({
      songs,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasMore: page * PAGE_SIZE < total,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
