import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; songId: string } }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: { id: params.id, userId: userId },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const playlistSong = await prisma.playlistSong.findUnique({
      where: {
        playlistId_songId: {
          playlistId: playlist.id,
          songId: params.songId,
        },
      },
    });

    if (!playlistSong) {
      return NextResponse.json(
        { error: "Song not in playlist" },
        { status: 404 }
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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
