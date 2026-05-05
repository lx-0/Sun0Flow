import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";
import { SongFilters } from "@/lib/songs";

const RELATED_LIMIT = 8;

/** Parse a comma-separated tags string into lowercase tokens */
function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  return tagsStr
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Jaccard-style tag overlap: shared / union */
function tagOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const shared = b.filter((t) => setA.has(t)).length;
  return shared / Math.max(a.length, b.length);
}

/**
 * GET /api/songs/:id/related
 *
 * Returns public songs by OTHER creators that are similar to this song,
 * based on tag/metadata overlap. Excludes the current song and all songs
 * by the same creator (to encourage discovery).
 *
 * Falls back to trending public songs when there are no tag-matched results.
 *
 * Query params:
 *   limit = 1–8 (default 8)
 *
 * No auth required — public endpoint.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") || "8", 10) || 8,
      RELATED_LIMIT
    );

    const key = cacheKey("related-songs", id, String(limit));
    const result = await cached(
      key,
      async () => {
        // Load target song (must be public)
        const song = await prisma.song.findUnique({
          where: { id },
          include: { songTags: { include: { tag: true } } },
        });

        if (!song || !song.isPublic || song.isHidden || song.archivedAt) return null;

        const songTagNames = song.songTags.map((st) => st.tag.name.toLowerCase());
        const songStyleTokens = parseTags(song.tags);
        const allTargetTokens = Array.from(new Set([...songTagNames, ...songStyleTokens]));

        // Load candidate public songs from other creators
        const candidates = await prisma.song.findMany({
          where: {
            ...SongFilters.publicDiscovery(),
            id: { not: id },
            userId: { not: song.userId },
          },
          include: {
            songTags: { include: { tag: true } },
            user: { select: { name: true, username: true } },
          },
          orderBy: { playCount: "desc" },
          take: 300, // limit initial pool for performance
        });

        // Score by tag overlap
        const scored = candidates
          .map((c) => {
            const cTagNames = c.songTags.map((st) => st.tag.name.toLowerCase());
            const cStyleTokens = parseTags(c.tags);
            const allCandidateTokens = Array.from(new Set([...cTagNames, ...cStyleTokens]));
            const score = tagOverlapScore(allTargetTokens, allCandidateTokens);
            return { song: c, score };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        // If we got enough results, return them
        if (scored.length > 0) {
          return {
            songs: scored.map(({ song: s, score }) => ({
              id: s.id,
              title: s.title,
              tags: s.tags,
              imageUrl: s.imageUrl,
              duration: s.duration,
              audioUrl: s.audioUrl,
              publicSlug: s.publicSlug,
              creatorName: s.user.name,
              creatorUsername: s.user.username,
              score,
            })),
            source: "similarity" as const,
          };
        }

        // Fallback: trending public songs from other creators
        const trending = await prisma.song.findMany({
          where: {
            ...SongFilters.publicDiscovery(),
            id: { not: id },
            userId: { not: song.userId },
          },
          include: { user: { select: { name: true, username: true } } },
          orderBy: { playCount: "desc" },
          take: limit,
        });

        if (trending.length === 0) return { songs: [], source: "trending" as const };

        return {
          songs: trending.map((s) => ({
            id: s.id,
            title: s.title,
            tags: s.tags,
            imageUrl: s.imageUrl,
            duration: s.duration,
            audioUrl: s.audioUrl,
            publicSlug: s.publicSlug,
            creatorName: s.user.name,
            creatorUsername: s.user.username,
            score: 0,
          })),
          source: "trending" as const,
        };
      },
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result.songs, total: result.songs.length, source: result.source });
  } catch (error) {
    logServerError("related-songs", error, { route: "/api/songs/[id]/related" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
