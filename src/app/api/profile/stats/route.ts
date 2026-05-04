import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const GET = authRoute(async (_request, { auth }) => {
  const [user, totalSongs, totalFavorites, totalPlaylists, totalTemplates] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: {
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { followers: true, following: true } },
        },
      }),
      prisma.song.count({ where: { userId: auth.userId } }),
      prisma.song.count({ where: { userId: auth.userId, isFavorite: true } }),
      prisma.playlist.count({ where: { userId: auth.userId } }),
      prisma.promptTemplate.count({ where: { userId: auth.userId } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "User not found", code: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    totalSongs,
    totalFavorites,
    totalPlaylists,
    totalTemplates,
    followersCount: user._count.followers,
    followingCount: user._count.following,
    memberSince: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
}, { route: "/api/profile/stats" });
