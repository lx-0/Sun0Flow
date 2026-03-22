import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";

export async function GET(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const songId = searchParams.get("songId");

    const where: { userId: string; songId?: string } = { userId };
    if (songId) {
      where.songId = songId;
    }

    const ratings = await prisma.rating.findMany({
      where,
      select: {
        id: true,
        songId: true,
        value: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ ratings });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const body = await request.json();
    const { songId, value } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { error: "songId is required" },
        { status: 400 }
      );
    }

    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
      return NextResponse.json(
        { error: "value must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    // Verify the song exists
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { id: true },
    });

    if (!song) {
      return NextResponse.json(
        { error: "Song not found" },
        { status: 404 }
      );
    }

    const rating = await prisma.rating.upsert({
      where: {
        userId_songId: { userId, songId },
      },
      create: {
        userId,
        songId,
        value,
      },
      update: {
        value,
      },
    });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({
      id: rating.id,
      songId: rating.songId,
      value: rating.value,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
