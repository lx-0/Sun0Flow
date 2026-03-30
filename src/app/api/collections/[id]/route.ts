import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CacheControl, CacheTTL, cached, cacheKey } from "@/lib/cache";

const SONG_SELECT = {
  id: true,
  title: true,
  tags: true,
  imageUrl: true,
  audioUrl: true,
  duration: true,
  playCount: true,
  rating: true,
  publicSlug: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const key = cacheKey("collections", "detail", id);
    const collection = await cached(
      key,
      async () => {
        const row = await prisma.collection.findFirst({
          where: { id, isPublic: true },
          include: {
            songs: {
              orderBy: { position: "asc" },
              include: { song: { select: SONG_SELECT } },
            },
            _count: { select: { songs: true } },
          },
        });

        if (!row) return null;

        return {
          id: row.id,
          title: row.title,
          description: row.description,
          coverImage:
            row.coverImage ?? row.songs[0]?.song.imageUrl ?? null,
          songCount: row._count.songs,
          songs: row.songs.map((cs) => ({
            ...cs.song,
            createdAt: cs.song.createdAt.toISOString(),
          })),
          createdAt: row.createdAt.toISOString(),
        };
      },
      CacheTTL.DISCOVER
    );

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { collection },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
