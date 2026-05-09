import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";

async function findAccessibleSong(id: string, userId: string) {
  return prisma.song.findFirst({
    where: {
      id,
      OR: [{ userId }, { isPublic: true }],
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await findAccessibleSong(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_songId: { userId, songId: song.id } },
    });

    return NextResponse.json({ isFavorite: !!existing });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await findAccessibleSong(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_songId: { userId: userId, songId: song.id } },
      create: { userId: userId, songId: song.id },
      update: {},
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    invalidateByPrefix(`dashboard-stats:${userId}`);
    recordActivity({ userId, type: "song_favorited", songId: song.id });

    return NextResponse.json({ isFavorite: true, favoriteCount: count, favoriteId: favorite.id });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await findAccessibleSong(id, userId);
    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    await prisma.favorite.deleteMany({
      where: { userId: userId, songId: song.id },
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ isFavorite: false, favoriteCount: count });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
