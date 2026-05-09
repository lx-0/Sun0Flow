import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const song = await prisma.song.findFirst({
    where: { id: params.id, userId: auth.userId },
  });

  if (!song) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  if (song.archivedAt) {
    return NextResponse.json({ error: "Song is already archived", code: "ALREADY_ARCHIVED" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: params.id },
      data: { archivedAt: new Date(), isPublic: false },
    });

    let playlist = await tx.playlist.findFirst({
      where: { userId: auth.userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
    });

    if (!playlist) {
      playlist = await tx.playlist.create({
        data: {
          name: "Archive",
          userId: auth.userId,
          isSmartPlaylist: true,
          smartPlaylistType: "archive",
        },
      });
    }

    const lastSong = await tx.playlistSong.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { position: "desc" },
    });

    await tx.playlistSong.upsert({
      where: { playlistId_songId: { playlistId: playlist.id, songId: params.id } },
      create: {
        playlistId: playlist.id,
        songId: params.id,
        position: lastSong ? lastSong.position + 1 : 0,
        addedByUserId: auth.userId,
      },
      update: {},
    });

    return updatedSong;
  });

  return NextResponse.json({ song: updated });
}, { route: "/api/songs/[id]/archive" });
