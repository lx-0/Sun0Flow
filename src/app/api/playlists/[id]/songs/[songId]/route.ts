import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; songId: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Find playlist — allow owner or editor-role collaborator
    const playlist = await prisma.playlist.findFirst({
      where: {
        id: params.id,
        OR: [
          { userId },
          {
            isCollaborative: true,
            collaborators: { some: { userId, status: "accepted", role: "editor" } },
          },
        ],
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const playlistSong = await prisma.playlistSong.findUnique({
      where: {
        playlistId_songId: {
          playlistId: playlist.id,
          songId: params.songId,
        },
      },
      include: { song: { select: { title: true } } },
    });

    if (!playlistSong) {
      return NextResponse.json(
        { error: "Song not in playlist", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const isOwner = playlist.userId === userId;
    // Collaborators can only remove songs they added
    if (!isOwner && playlistSong.addedByUserId !== userId) {
      return NextResponse.json(
        { error: "You can only remove songs you added", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    await prisma.playlistSong.delete({
      where: { id: playlistSong.id },
    });

    // Re-order remaining songs to keep positions contiguous
    const remaining = await prisma.playlistSong.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: "asc" },
    });

    await Promise.all(
      remaining.map((ps, i) =>
        prisma.playlistSong.update({
          where: { id: ps.id },
          data: { position: i },
        })
      )
    );

    // Record activity for collaborative playlists
    if (playlist.isCollaborative) {
      recordActivity({
        userId,
        type: "song_removed_from_playlist",
        songId: params.songId,
        playlistId: playlist.id,
        metadata: { songTitle: playlistSong.song?.title ?? undefined },
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
