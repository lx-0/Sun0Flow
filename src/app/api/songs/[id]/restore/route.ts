import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { songRoute } from "@/lib/route-handler";
import { badRequest } from "@/lib/api-error";

export const POST = songRoute(async (_request, { song }) => {
  if (!song.archivedAt) {
    return badRequest("Song is not archived");
  }

  const archivePlaylist = await prisma.playlist.findFirst({
    where: { userId: song.userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: song.id },
      data: { archivedAt: null },
    });

    if (archivePlaylist) {
      await tx.playlistSong.deleteMany({
        where: { playlistId: archivePlaylist.id, songId: song.id },
      });
    }

    return updatedSong;
  });

  return NextResponse.json({ song: updated });
}, { route: "/api/songs/[id]/restore" });
