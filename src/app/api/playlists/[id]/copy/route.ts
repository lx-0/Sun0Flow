import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, cacheKey } from "@/lib/cache";

/**
 * POST /api/playlists/:id/copy
 * Copies a public playlist into the authenticated user's library.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Fetch source playlist — must be public
    const source = await prisma.playlist.findFirst({
      where: { id, isPublic: true },
      include: {
        songs: {
          orderBy: { position: "asc" },
          select: { songId: true, position: true },
        },
      },
    });

    if (!source) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Prevent copying your own playlist
    if (source.userId === userId) {
      return NextResponse.json(
        { error: "Cannot copy your own playlist", code: "FORBIDDEN" },
        { status: 400 }
      );
    }

    // Enforce per-user playlist limit (50)
    const playlistCount = await prisma.playlist.count({ where: { userId } });
    if (playlistCount >= 50) {
      return NextResponse.json(
        { error: "Playlist limit reached (50)", code: "LIMIT_REACHED" },
        { status: 400 }
      );
    }

    // Create new playlist + songs in a transaction
    const copy = await prisma.$transaction(async (tx) => {
      const newPlaylist = await tx.playlist.create({
        data: {
          name: source.name,
          description: source.description,
          userId,
          isPublic: false,
        },
      });

      if (source.songs.length > 0) {
        await tx.playlistSong.createMany({
          data: source.songs.map((ps) => ({
            playlistId: newPlaylist.id,
            songId: ps.songId,
            position: ps.position,
          })),
          skipDuplicates: true,
        });
      }

      return newPlaylist;
    });

    invalidateByPrefix(cacheKey("playlists", userId));

    return NextResponse.json({ playlist: { id: copy.id, name: copy.name } }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
