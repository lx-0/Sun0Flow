import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { CacheControl } from "@/lib/cache";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { rateLimited } from "@/lib/api-error";

// 60 search requests per user per minute
const SEARCH_LIMIT = 60;
const SEARCH_WINDOW_MS = 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { acquired, status: rlStatus } = await acquireRateLimitSlot(userId, "search", SEARCH_LIMIT, SEARCH_WINDOW_MS);
    if (!acquired) {
      return rateLimited("Search rate limit exceeded. Please slow down.", {
        rateLimit: rlStatus,
      });
    }

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
            { lyrics: { contains: q, mode: "insensitive" } },
            { tags: { contains: q, mode: "insensitive" } },
            { songTags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
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
          lyrics: true,
          songTags: { select: { tag: { select: { name: true } } }, take: 3 },
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
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
