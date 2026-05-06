import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateKey, invalidateByPrefix, cacheKey } from "@/lib/cache";
import { ownerWhere } from "@/lib/playlists";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const playlist = await prisma.playlist.findFirst({
      where: ownerWhere(id, userId),
      include: { _count: { select: { songs: true } } },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const newIsPublished = !playlist.isPublished;

    // Playlist must have at least 1 song to publish
    if (newIsPublished && playlist._count.songs === 0) {
      return NextResponse.json(
        { error: "Playlist must have at least 1 song to publish", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // Parse optional genre from request body
    let genre: string | undefined;
    try {
      const body = await request.json();
      if (body.genre !== undefined) {
        if (typeof body.genre === "string" && body.genre.trim().length > 0) {
          genre = body.genre.trim();
        } else if (body.genre === null) {
          genre = undefined;
        }
      }
    } catch {
      // No body or invalid JSON is fine - genre is optional
    }

    const slug = newIsPublished
      ? playlist.slug ?? randomBytes(6).toString("hex")
      : playlist.slug; // keep slug when unpublishing

    const data: Record<string, unknown> = {
      isPublished: newIsPublished,
      slug,
    };

    if (newIsPublished) {
      // Auto-set isPublic when publishing
      data.isPublic = true;
      // Set publishedAt only on first publish
      if (!playlist.publishedAt) {
        data.publishedAt = new Date();
      }
      if (genre !== undefined) {
        data.genre = genre;
      }
    }

    const updated = await prisma.playlist.update({
      where: { id: playlist.id },
      data,
    });

    // Invalidate cached public playlist page if slug exists
    if (updated.slug) {
      invalidateKey(cacheKey("public-playlist", updated.slug));
    }
    // Invalidate user's playlist cache
    invalidateByPrefix(cacheKey("playlists", userId));

    return NextResponse.json({
      isPublished: updated.isPublished,
      publishedAt: updated.publishedAt,
      genre: updated.genre,
      slug: updated.slug,
      isPublic: updated.isPublic,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
