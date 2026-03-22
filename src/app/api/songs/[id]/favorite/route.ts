import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_songId: { userId: userId, songId: song.id } },
      create: { userId: userId, songId: song.id },
      update: {},
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ isFavorite: true, favoriteCount: count, favoriteId: favorite.id });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.favorite.deleteMany({
      where: { userId: userId, songId: song.id },
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ isFavorite: false, favoriteCount: count });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
