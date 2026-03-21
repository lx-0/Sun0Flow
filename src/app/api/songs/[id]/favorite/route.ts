import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_songId: { userId: session.user.id, songId: song.id } },
      create: { userId: session.user.id, songId: song.id },
      update: {},
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    return NextResponse.json({ isFavorite: true, favoriteCount: count, favoriteId: favorite.id });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const song = await prisma.song.findFirst({
      where: { id: params.id, userId: session.user.id },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.favorite.deleteMany({
      where: { userId: session.user.id, songId: song.id },
    });

    const count = await prisma.favorite.count({ where: { songId: song.id } });

    return NextResponse.json({ isFavorite: false, favoriteCount: count });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
