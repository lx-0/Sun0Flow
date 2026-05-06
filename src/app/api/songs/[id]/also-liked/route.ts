import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const ALSO_LIKED_LIMIT = 8;
const MIN_FAVORITES_FOR_COLLABORATIVE = 10;

function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  return tagsStr
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function tagOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const shared = b.filter((t) => setA.has(t)).length;
  return shared / Math.max(a.length, b.length);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "8", 10) || 8,
      ALSO_LIKED_LIMIT
    );

    const key = cacheKey("also-liked", userId, id, String(limit));
    const result = await cached(
      key,
      async () => {
        // Load target song
        const song = await prisma.song.findFirst({
          where: { id, userId },
          include: { songTags: { include: { tag: true } } },
        });
        if (!song) return null;

        const songTagNames = song.songTags.map((st) => st.tag.name.toLowerCase());
        const songStyleTokens = parseTags(song.tags);
        const allTargetTokens = Array.from(new Set([...songTagNames, ...songStyleTokens]));

        // Count user's total favorites
        const totalFavorites = await prisma.favorite.count({ where: { userId } });

        if (totalFavorites >= MIN_FAVORITES_FOR_COLLABORATIVE) {
          // Collaborative-style: find songs co-favorited with this song.
          // Among all songs in the db favorited by users who also favorited this song,
          // rank by co-favorite frequency (excluding current user's own songs for variety,
          // but fall back to user's favorites if not enough cross-user data).
          const coFavoriters = await prisma.favorite.findMany({
            where: { songId: id, userId: { not: userId } },
            select: { userId: true },
            take: 100,
          });

          let songs: { id: string; title: string | null; tags: string | null; imageUrl: string | null; duration: number | null; audioUrl: string | null; createdAt: Date }[] = [];

          if (coFavoriters.length > 0) {
            const coFavoriterIds = coFavoriters.map((f) => f.userId);
            // Find songs those users also favorited (public songs only for cross-user recs)
            const coFavoritedSongs = await prisma.favorite.groupBy({
              by: ["songId"],
              where: {
                userId: { in: coFavoriterIds },
                songId: { not: id },
                song: { isPublic: true, archivedAt: null, generationStatus: "ready" },
              },
              _count: { songId: true },
              orderBy: { _count: { songId: "desc" } },
              take: limit,
            });

            if (coFavoritedSongs.length > 0) {
              songs = await prisma.song.findMany({
                where: { id: { in: coFavoritedSongs.map((f) => f.songId) } },
                select: { id: true, title: true, tags: true, imageUrl: true, duration: true, audioUrl: true, createdAt: true },
              });
            }
          }

          // If not enough cross-user data, supplement with user's own co-favorites
          if (songs.length < limit) {
            const userFavoritedIds = await prisma.favorite.findMany({
              where: { userId, songId: { not: id } },
              select: { songId: true },
            });
            const excludeIds = new Set([id, ...songs.map((s) => s.id)]);
            const candidates = await prisma.song.findMany({
              where: {
                userId,
                id: { in: userFavoritedIds.map((f) => f.songId).filter((sid) => !excludeIds.has(sid)) },
                archivedAt: null,
                generationStatus: "ready",
              },
              include: { songTags: { include: { tag: true } } },
              take: 50,
            });

            const scored = candidates
              .map((c) => {
                const cTokens = Array.from(
                  new Set([...c.songTags.map((st) => st.tag.name.toLowerCase()), ...parseTags(c.tags)])
                );
                return { song: c, score: tagOverlapScore(allTargetTokens, cTokens) };
              })
              .sort((a, b) => b.score - a.score)
              .slice(0, limit - songs.length);

            songs = [
              ...songs,
              ...scored.map(({ song: s }) => ({
                id: s.id,
                title: s.title,
                tags: s.tags,
                imageUrl: s.imageUrl,
                duration: s.duration,
                audioUrl: s.audioUrl,
                createdAt: s.createdAt,
              })),
            ];
          }

          return songs.map((s) => ({
            id: s.id,
            title: s.title,
            tags: s.tags,
            imageUrl: s.imageUrl,
            duration: s.duration,
            audioUrl: s.audioUrl,
            createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
          }));
        }

        // Fallback: tag-based similarity among the user's songs
        const candidates = await prisma.song.findMany({
          where: {
            userId,
            id: { not: id },
            archivedAt: null,
            generationStatus: "ready",
          },
          include: { songTags: { include: { tag: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        });

        const scored = candidates
          .map((c) => {
            const cTokens = Array.from(
              new Set([...c.songTags.map((st) => st.tag.name.toLowerCase()), ...parseTags(c.tags)])
            );
            return { song: c, score: tagOverlapScore(allTargetTokens, cTokens) };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        return scored.map(({ song: s }) => ({
          id: s.id,
          title: s.title,
          tags: s.tags,
          imageUrl: s.imageUrl,
          duration: s.duration,
          audioUrl: s.audioUrl,
          createdAt: s.createdAt.toISOString(),
        }));
      },
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result, total: result.length });
  } catch (error) {
    logServerError("also-liked", error, { route: "/api/songs/[id]/also-liked" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
