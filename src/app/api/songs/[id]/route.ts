import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { computeETag, CacheControl, invalidateKey, cacheKey } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import { findUserSong } from "@/lib/songs";

export const GET = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const song = await findUserSong(auth.userId, params.id);

  if (!song) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const etag = computeETag(song);

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": CacheControl.privateShort,
      },
    });
  }

  return NextResponse.json({ song }, {
    headers: {
      ETag: etag,
      "Cache-Control": CacheControl.privateShort,
    },
  });
});

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const { visibility } = body as { visibility?: string };

  if (visibility !== undefined && visibility !== "public" && visibility !== "private") {
    return NextResponse.json(
      { error: "visibility must be 'public' or 'private'", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const song = await prisma.song.findFirst({
    where: { id: params.id, userId: auth.userId },
  });
  if (!song) {
    return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (visibility !== undefined) {
    const isPublic = visibility === "public";
    updateData.isPublic = isPublic;
    if (isPublic && !song.publicSlug) {
      updateData.publicSlug = randomBytes(6).toString("hex");
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const updated = await prisma.song.update({ where: { id: params.id }, data: updateData });

  if (updated.publicSlug) {
    invalidateKey(cacheKey("public-song", updated.publicSlug));
  }

  return NextResponse.json({
    visibility: updated.isPublic ? "public" : "private",
    isPublic: updated.isPublic,
    publicSlug: updated.publicSlug,
  });
});
