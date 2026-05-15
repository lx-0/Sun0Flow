import { z } from "zod";
import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { badRequest, notFound } from "@/lib/api-error";

/**
 * PATCH /api/songs/[id]/cover-art
 *
 * Updates a song's cover art URL. Accepts either:
 * - An image data URI (SVG from AI generator, or uploaded raster JPEG/PNG/WEBP)
 * - An absolute HTTPS URL (user-provided external image)
 *
 * Body: { imageUrl: string }
 */
const coverArtBody = z.object({
  imageUrl: z.string().min(1, "imageUrl is required"),
});

export const PATCH = authRoute<{ id: string }, z.infer<typeof coverArtBody>>(
  async (_request, { auth, params, body }) => {
    const { id } = params;
    const song = await prisma.song.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });

    if (!song) {
      return notFound();
    }
    const { imageUrl } = body;

    // Accept image data URIs (generated SVG or uploaded raster) or HTTPS URLs
    const isDataUri = imageUrl.startsWith("data:image/");
    const isHttps = imageUrl.startsWith("https://");
    if (!isDataUri && !isHttps) {
      return badRequest("imageUrl must be a data URI or HTTPS URL");
    }

    // Base64 of a 4 MB image ≈ 5.6 MB
    if (isDataUri && imageUrl.length > 5_800_000) {
      return badRequest("Cover art data URI is too large");
    }

    const updated = await prisma.song.update({
      where: { id: song.id },
      data: { imageUrl, imageUrlIsCustom: true },
      select: { id: true, imageUrl: true },
    });

    invalidateByPrefix(`dashboard-stats:${auth.userId}`);

    return NextResponse.json({ song: updated });
  },
  { route: "/api/songs/[id]/cover-art", body: coverArtBody },
);
