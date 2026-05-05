import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { songRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";

export const POST = songRoute(async (_request, { auth, song }) => {
  if (song.archivedAt) {
    return badRequest("Song is already archived");
  }

  let playlist = await prisma.playlist.findFirst({
    where: { userId: auth.userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
  });

  if (!playlist) {
    playlist = await prisma.playlist.create({
      data: {
        name: "Archive",
        userId: auth.userId,
        isSmartPlaylist: true,
        smartPlaylistType: "archive",
      },
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: song.id },
      data: { archivedAt: new Date(), isPublic: false },
    });

    const lastSong = await tx.playlistSong.findFirst({
      where: { playlistId: playlist!.id },
      orderBy: { position: "desc" },
    });

    await tx.playlistSong.upsert({
      where: { playlistId_songId: { playlistId: playlist!.id, songId: song.id } },
      create: {
        playlistId: playlist!.id,
        songId: song.id,
        position: lastSong ? lastSong.position + 1 : 0,
        addedByUserId: auth.userId,
      },
      update: {},
    });

    return updatedSong;
  });

  return NextResponse.json({ song: updated });
}, { route: "/api/songs/[id]/archive" });
