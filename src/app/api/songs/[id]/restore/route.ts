import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";

export const POST = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const song = await prisma.song.findFirst({
    where: { id: params.id, userId: auth.userId, archivedAt: { not: null } },
  });

  if (!song) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const archivePlaylist = await prisma.playlist.findFirst({
    where: { userId: auth.userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: params.id },
      data: { archivedAt: null },
    });

    if (archivePlaylist) {
      await tx.playlistSong.deleteMany({
        where: { playlistId: archivePlaylist.id, songId: params.id },
      });
    }

    return updatedSong;
  });

  return NextResponse.json({ song: updated });
}, { route: "/api/songs/[id]/restore" });
