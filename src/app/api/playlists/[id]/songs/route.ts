import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

const MAX_SONGS_PER_PLAYLIST = 500;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId: userId },
      include: { _count: { select: { songs: true } } },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const { songId } = body;

    if (!songId || typeof songId !== "string") {
      return NextResponse.json(
        { error: "songId is required" },
        { status: 400 }
      );
    }

    // Verify user owns the song
    const song = await prisma.song.findFirst({
      where: { id: songId, userId: userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }

    if (playlist._count.songs >= MAX_SONGS_PER_PLAYLIST) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_SONGS_PER_PLAYLIST} songs per playlist` },
        { status: 400 }
      );
    }

    // Check if already in playlist
    const existing = await prisma.playlistSong.findUnique({
      where: { playlistId_songId: { playlistId: playlist.id, songId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Song already in playlist" },
        { status: 400 }
      );
    }

    // Get next position
    const lastSong = await prisma.playlistSong.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { position: "desc" },
    });

    const position = lastSong ? lastSong.position + 1 : 0;

    const playlistSong = await prisma.playlistSong.create({
      data: {
        playlistId: playlist.id,
        songId,
        position,
      },
      include: { song: true },
    });

    return NextResponse.json({ playlistSong }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
