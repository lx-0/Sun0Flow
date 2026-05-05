import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { CacheControl, invalidateByPrefix, cacheKey } from "@/lib/cache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Allow owner or accepted collaborator to read
    const playlist = await prisma.playlist.findFirst({
      where: {
        id,
        OR: [
          { userId },
          {
            isCollaborative: true,
            collaborators: { some: { userId, status: "accepted" } },
          },
        ],
      },
      include: {
        songs: {
          orderBy: { position: "asc" },
          include: {
            song: true,
            addedByUser: { select: { id: true, name: true, image: true, avatarUrl: true } },
          },
        },
        _count: { select: { songs: true } },
        collaborators: {
          where: { status: "accepted" },
          include: {
            user: { select: { id: true, name: true, image: true, avatarUrl: true } },
          },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Hide archived songs from all playlists except the Archive playlist
    if (playlist.smartPlaylistType !== "archive") {
      playlist.songs = playlist.songs.filter((ps) => !ps.song.archivedAt);
    }

    const isOwner = playlist.userId === userId;
    return NextResponse.json({ playlist, isOwner }, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

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
    const data: { name?: string; description?: string | null } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || body.name.trim().length === 0) {
        return NextResponse.json(
          { error: "Name is required", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      if (body.name.trim().length > 100) {
        return NextResponse.json(
          { error: "Name must be 100 characters or less", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      data.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description === "string" && body.description.length > 1000) {
        return NextResponse.json(
          { error: "Description must be 1000 characters or less", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      data.description = body.description?.trim() || null;
    }

    const updated = await prisma.playlist.update({
      where: { id: playlist.id },
      data,
      include: { _count: { select: { songs: true } } },
    });

    invalidateByPrefix(cacheKey("playlists", userId));
    return NextResponse.json({ playlist: updated });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await prisma.playlist.delete({ where: { id: playlist.id } });

    invalidateByPrefix(cacheKey("playlists", userId));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
