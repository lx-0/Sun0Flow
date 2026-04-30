import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { logServerError } from "@/lib/error-logger";

/**
 * PATCH /api/songs/[id]/cover-art
 *
 * Updates a song's cover art URL. Accepts either:
 * - An image data URI (SVG from AI generator, or uploaded raster JPEG/PNG/WEBP)
 * - An absolute HTTPS URL (user-provided external image)
 *
 * Body: { imageUrl: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { id } = await params;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId! },
      select: { id: true },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const { imageUrl } = body;

    if (typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl is required", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Accept image data URIs (generated SVG or uploaded raster) or HTTPS URLs
    const isDataUri = imageUrl.startsWith("data:image/");
    const isHttps = imageUrl.startsWith("https://");
    if (!isDataUri && !isHttps) {
      return NextResponse.json(
        { error: "imageUrl must be a data URI or HTTPS URL", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Base64 of a 4 MB image ≈ 5.6 MB
    if (isDataUri && imageUrl.length > 5_800_000) {
      return NextResponse.json(
        { error: "Cover art data URI is too large", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const updated = await prisma.song.update({
      where: { id: song.id },
      data: { imageUrl, imageUrlIsCustom: true },
      select: { id: true, imageUrl: true },
    });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ song: updated });
  } catch (error) {
    logServerError("cover-art-update", error, {
      route: "/api/songs/[id]/cover-art",
    });
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
