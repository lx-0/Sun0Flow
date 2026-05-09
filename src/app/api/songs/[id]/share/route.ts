import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateKey, cacheKey } from "@/lib/cache";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const song = await prisma.song.findFirst({
      where: { id, userId: userId },
    });

    if (!song) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const newIsPublic = !song.isPublic;
    const publicSlug = newIsPublic
      ? song.publicSlug ?? randomBytes(6).toString("hex")
      : song.publicSlug; // keep slug even when toggling off

    const updated = await prisma.song.update({
      where: { id: song.id },
      data: { isPublic: newIsPublic, publicSlug },
    });

    // Invalidate cached public song page if slug exists
    if (updated.publicSlug) {
      invalidateKey(cacheKey("public-song", updated.publicSlug));
    }

    return NextResponse.json({
      isPublic: updated.isPublic,
      publicSlug: updated.publicSlug,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
