import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { CacheControl } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (!q) {
      return NextResponse.json({ songs: [], playlists: [] });
    }

    const [songs, playlists] = await Promise.all([
      prisma.song.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { prompt: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          prompt: true,
          imageUrl: true,
          generationStatus: true,
          createdAt: true,
        },
      }),
      prisma.playlist.findMany({
        where: {
          userId,
          name: { contains: q, mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          name: true,
          description: true,
          _count: { select: { songs: true } },
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({ songs, playlists }, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
