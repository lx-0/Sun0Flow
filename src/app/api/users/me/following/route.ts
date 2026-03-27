import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const skip = (page - 1) * PAGE_SIZE;

    const [follows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          createdAt: true,
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              image: true,
              avatarUrl: true,
              bio: true,
              _count: {
                select: {
                  followers: true,
                  songs: { where: { isPublic: true, isHidden: false, archivedAt: null } },
                },
              },
            },
          },
        },
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    const users = follows.map(({ following, createdAt }) => ({
      id: following.id,
      name: following.name,
      username: following.username,
      image: following.image,
      avatarUrl: following.avatarUrl,
      bio: following.bio,
      followersCount: following._count.followers,
      publicSongsCount: following._count.songs,
      followedAt: createdAt,
    }));

    return NextResponse.json({
      users,
      pagination: {
        page,
        totalPages: Math.ceil(total / PAGE_SIZE),
        total,
        hasMore: skip + PAGE_SIZE < total,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
