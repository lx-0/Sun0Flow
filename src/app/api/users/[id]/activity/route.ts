import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const skip = (page - 1) * PAGE_SIZE;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { userId: params.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          type: true,
          createdAt: true,
          song: {
            select: {
              id: true,
              publicSlug: true,
              title: true,
              imageUrl: true,
              duration: true,
              tags: true,
              isPublic: true,
              isHidden: true,
              archivedAt: true,
              generationStatus: true,
            },
          },
          playlist: {
            select: {
              id: true,
              name: true,
              slug: true,
              isPublic: true,
              _count: { select: { songs: true } },
            },
          },
        },
      }),
      prisma.activity.count({ where: { userId: params.id } }),
    ]);

    const items = activities
      .filter((a) => {
        if (a.type === "song_created" || a.type === "song_favorited") {
          return (
            a.song &&
            a.song.isPublic &&
            !a.song.isHidden &&
            !a.song.archivedAt &&
            a.song.generationStatus === "ready"
          );
        }
        if (a.type === "playlist_created") {
          return a.playlist && a.playlist.isPublic;
        }
        return false;
      })
      .map((a) => ({
        id: a.id,
        type: a.type,
        createdAt: a.createdAt,
        song: a.song
          ? {
              id: a.song.id,
              publicSlug: a.song.publicSlug,
              title: a.song.title,
              imageUrl: a.song.imageUrl,
              duration: a.song.duration,
              tags: a.song.tags,
            }
          : null,
        playlist: a.playlist
          ? {
              id: a.playlist.id,
              name: a.playlist.name,
              slug: a.playlist.slug,
              songCount: a.playlist._count.songs,
            }
          : null,
      }));

    return NextResponse.json({
      items,
      pagination: {
        page,
        totalPages: Math.ceil(total / PAGE_SIZE),
        total,
        hasMore: skip + PAGE_SIZE < total,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
