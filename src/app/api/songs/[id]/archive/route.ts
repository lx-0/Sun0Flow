import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    if (song.archivedAt) {
      return NextResponse.json({ error: "Song is already archived", code: "ALREADY_ARCHIVED" }, { status: 400 });
    }

    // Find or create the user's Archive playlist
    let playlist = await prisma.playlist.findFirst({
      where: { userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
    });

    if (!playlist) {
      playlist = await prisma.playlist.create({
        data: {
          name: "Archive",
          userId,
          isSmartPlaylist: true,
          smartPlaylistType: "archive",
        },
      });
    }

    // Archive the song and add to playlist in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatedSong = await tx.song.update({
        where: { id },
        data: { archivedAt: new Date(), isPublic: false },
      });

      // Get next position in the archive playlist
      const lastSong = await tx.playlistSong.findFirst({
        where: { playlistId: playlist!.id },
        orderBy: { position: "desc" },
      });

      await tx.playlistSong.upsert({
        where: { playlistId_songId: { playlistId: playlist!.id, songId: id } },
        create: {
          playlistId: playlist!.id,
          songId: id,
          position: lastSong ? lastSong.position + 1 : 0,
          addedByUserId: userId,
        },
        update: {},
      });

      return updatedSong;
    });

    return NextResponse.json({ song: updated });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
