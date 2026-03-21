import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, totalSongs, totalFavorites, totalPlaylists, totalTemplates] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { createdAt: true, lastLoginAt: true },
      }),
      prisma.song.count({ where: { userId } }),
      prisma.song.count({ where: { userId, isFavorite: true } }),
      prisma.playlist.count({ where: { userId } }),
      prisma.promptTemplate.count({ where: { userId } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    totalSongs,
    totalFavorites,
    totalPlaylists,
    totalTemplates,
    memberSince: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
}
