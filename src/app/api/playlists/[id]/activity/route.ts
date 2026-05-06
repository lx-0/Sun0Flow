import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { memberWhere } from "@/lib/playlists";

const PAGE_SIZE = 20;

// GET /api/playlists/[id]/activity — fetch activity feed for a collaborative playlist
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: memberWhere(id, userId),
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const activities = await prisma.activity.findMany({
      where: {
        playlistId: playlist.id,
        type: { in: ["song_added_to_playlist", "song_removed_from_playlist"] },
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, image: true, avatarUrl: true } },
        song: { select: { id: true, title: true, imageUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    });

    const nextCursor =
      activities.length === PAGE_SIZE ? activities[activities.length - 1].id : null;

    return NextResponse.json({ activities, nextCursor });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
