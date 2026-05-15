import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { notFound } from "@/lib/api-error";

/**
 * POST /api/songs/[id]/cover-art/generate
 *
 * Generates mock cover art variants for a song using the song's metadata.
 * Returns 3 variants (abstract, illustrated, photographic) as SVG data URLs.
 *
 * In v1 this is a placeholder that generates deterministic SVG images.
 * A future version can integrate an external AI image generation service.
 */
export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { id } = params;
    const song = await prisma.song.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, title: true, tags: true },
    });

    if (!song) {
      return notFound();
    }

    const variants = generateCoverArtVariants({
      songId: song.id,
      title: song.title,
      tags: song.tags,
    });

    return NextResponse.json({ variants });
  },
  { route: "/api/songs/[id]/cover-art/generate" },
);
