import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { logServerError } from "@/lib/error-logger";

/**
 * POST /api/songs/[id]/cover-art/generate
 *
 * Generates mock cover art variants for a song using the song's metadata.
 * Returns 3 variants (abstract, illustrated, photographic) as SVG data URLs.
 *
 * In v1 this is a placeholder that generates deterministic SVG images.
 * A future version can integrate an external AI image generation service.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId! },
      select: { id: true, title: true, tags: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const variants = generateCoverArtVariants({
      songId: song.id,
      title: song.title,
      tags: song.tags,
    });

    return NextResponse.json({ variants });
  } catch (error) {
    logServerError("cover-art-generate", error, {
      route: "/api/songs/[id]/cover-art/generate",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
