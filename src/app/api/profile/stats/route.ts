import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId, error: authError } = await resolveUser(request);

  if (authError) return authError;

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
