import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { CacheControl, CacheTTL, cached, invalidateByPrefix, cacheKey } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";
import { badRequest } from "@/lib/api-error";

const MAX_PLAYLISTS = 50;

export const GET = authRoute(async (_request, { auth }) => {
  const playlists = await cached(
    cacheKey("playlists", auth.userId),
    () =>
      prisma.playlist.findMany({
        where: { userId: auth.userId },
        include: { _count: { select: { songs: true } } },
        orderBy: { updatedAt: "desc" },
      }),
    CacheTTL.PLAYLIST
  );

  return NextResponse.json({ playlists }, {
    headers: { "Cache-Control": CacheControl.privateShort },
  });
}, { route: "/api/playlists" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return badRequest("Name is required");
  }

  if (name.trim().length > 100) {
    return badRequest("Name must be 100 characters or less");
  }

  if (description && typeof description === "string" && description.length > 1000) {
    return badRequest("Description must be 1000 characters or less");
  }

  const count = await prisma.playlist.count({
    where: { userId: auth.userId },
  });

  if (count >= MAX_PLAYLISTS) {
    return badRequest(`Maximum of ${MAX_PLAYLISTS} playlists reached`);
  }

  const playlist = await prisma.playlist.create({
    data: {
      name: stripHtml(name).trim(),
      description: description ? stripHtml(description).trim() || null : null,
      userId: auth.userId,
    },
    include: { _count: { select: { songs: true } } },
  });

  invalidateByPrefix(cacheKey("playlists", auth.userId));
  recordActivity({ userId: auth.userId, type: "playlist_created", playlistId: playlist.id });
  return NextResponse.json({ playlist }, { status: 201 });
}, { route: "/api/playlists" });
