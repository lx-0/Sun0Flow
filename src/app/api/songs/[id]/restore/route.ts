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
      where: { id, userId, archivedAt: { not: null } },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const archivePlaylist = await prisma.playlist.findFirst({
      where: { userId, isSmartPlaylist: true, smartPlaylistType: "archive" },
    });

    const updated = await prisma.$transaction(async (tx) => {
      const updatedSong = await tx.song.update({
        where: { id },
        data: { archivedAt: null },
      });

      if (archivePlaylist) {
        await tx.playlistSong.deleteMany({
          where: { playlistId: archivePlaylist.id, songId: id },
        });
      }

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
