import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id, userId: userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { songIds } = body;

    if (!Array.isArray(songIds)) {
      return NextResponse.json(
        { error: "songIds array is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Verify all songIds belong to this playlist
    const existing = await prisma.playlistSong.findMany({
      where: { playlistId: playlist.id },
    });

    const existingSongIds = new Set(existing.map((ps) => ps.songId));
    const valid = songIds.every((id: string) => existingSongIds.has(id));

    if (!valid || songIds.length !== existing.length) {
      return NextResponse.json(
        { error: "songIds must match all songs in the playlist", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Update positions in a transaction
    await prisma.$transaction(
      songIds.map((songId: string, index: number) =>
        prisma.playlistSong.update({
          where: {
            playlistId_songId: { playlistId: playlist.id, songId },
          },
          data: { position: index },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
