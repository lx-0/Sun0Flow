import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateKey, cacheKey } from "@/lib/cache";
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
    });

    if (!playlist) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const newIsPublic = !playlist.isPublic;
    const slug = newIsPublic
      ? playlist.slug ?? randomBytes(6).toString("hex")
      : playlist.slug; // keep slug even when toggling off

    const updated = await prisma.playlist.update({
      where: { id: playlist.id },
      data: {
        isPublic: newIsPublic,
        slug,
        shareCount: newIsPublic
          ? { increment: 1 }
          : playlist.shareCount,
      },
    });

    // Invalidate cached public playlist page if slug exists
    if (updated.slug) {
      invalidateKey(cacheKey("public-playlist", updated.slug));
    }

    return NextResponse.json({
      isPublic: updated.isPublic,
      slug: updated.slug,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
