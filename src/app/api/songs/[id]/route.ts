import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { computeETag, CacheControl } from "@/lib/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId },
      include: {
        songTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
        favorites: { where: { userId: userId }, select: { id: true } },
        _count: { select: { favorites: true } },
      },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { favorites, _count, ...rest } = song;
    const data = {
      ...rest,
      isFavorite: favorites.length > 0,
      favoriteCount: _count.favorites,
    };

    const etag = computeETag(data);

    // Conditional request — return 304 if data hasn't changed
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": CacheControl.privateShort,
        },
      });
    }

    return NextResponse.json({ song: data }, {
      headers: {
        ETag: etag,
        "Cache-Control": CacheControl.privateShort,
      },
    });
  } catch (error) {
    logServerError("song-detail", error, { route: "/api/songs/[id]" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
