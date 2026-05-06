import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { cached, cacheKey, CacheTTL } from "@/lib/cache";

const SIMILAR_LIMIT = 8;

/** Parse a comma-separated Suno tags string into an array of lowercase tokens */
function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return [];
  return tagsStr
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Compute a similarity score between two sets of tags.
 *  Score = number of shared tokens / max(|a|, |b|) so larger sets don't dominate.
 */
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
      SIMILAR_LIMIT
    );

    const key = cacheKey("similar-songs", userId, id, String(limit));
    const result = await cached(
      key,
      async () => {
        // Load target song
        const song = await prisma.song.findFirst({
          where: { id, userId },
          include: {
            songTags: { include: { tag: true } },
          },
        });

        if (!song) return null;

        const songTagNames = song.songTags.map((st) => st.tag.name.toLowerCase());
        const songStyleTokens = parseTags(song.tags);
        const allTargetTokens = Array.from(new Set([...songTagNames, ...songStyleTokens]));

        // Load candidate songs (exclude current, archived, not-ready)
        const candidates = await prisma.song.findMany({
          where: {
            userId,
            id: { not: id },
            archivedAt: null,
            generationStatus: "ready",
          },
          include: {
            songTags: { include: { tag: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200, // limit initial pool for performance
        });

        // Score each candidate
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

        return scored.map(({ song: s, score }) => ({
          id: s.id,
          title: s.title,
          tags: s.tags,
          imageUrl: s.imageUrl,
          duration: s.duration,
          audioUrl: s.audioUrl,
          createdAt: s.createdAt.toISOString(),
          score,
        }));
      },
      CacheTTL.RECOMMENDATIONS
    );

    if (result === null) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({ songs: result, total: result.length });
  } catch (error) {
    logServerError("similar-songs", error, { route: "/api/songs/[id]/similar" });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
