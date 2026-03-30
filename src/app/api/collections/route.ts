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
  publicSlug: true,
  createdAt: true,
  user: { select: { id: true, name: true, username: true } },
} as const;

export async function GET() {
  try {
    const key = cacheKey("collections", "list");
    const collections = await cached(
      key,
      async () => {
        const rows = await prisma.collection.findMany({
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          include: {
            songs: {
              orderBy: { position: "asc" },
              take: 4, // preview thumbnails
              include: { song: { select: SONG_SELECT } },
            },
            _count: { select: { songs: true } },
          },
        });

        return rows.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          coverImage:
            c.coverImage ??
            c.songs[0]?.song.imageUrl ??
            null,
          songCount: c._count.songs,
          previewSongs: c.songs.map((cs) => ({
            ...cs.song,
            createdAt: cs.song.createdAt.toISOString(),
          })),
          createdAt: c.createdAt.toISOString(),
        }));
      },
      CacheTTL.DISCOVER
    );

    return NextResponse.json(
      { collections },
      { headers: { "Cache-Control": CacheControl.publicShort } }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
