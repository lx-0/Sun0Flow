import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/sanitize";
import { CacheControl, CacheTTL, cached, invalidateByPrefix, cacheKey } from "@/lib/cache";
import { recordActivity } from "@/lib/activity";
import { badRequest } from "@/lib/api-error";
import { MAX_PLAYLISTS } from "@/lib/playlists";

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

const createPlaylistBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  description: z.string().max(1000, "Description must be 1000 characters or less").optional(),
});

export const POST = authRoute(async (_request, { auth, body }) => {
  const count = await prisma.playlist.count({
    where: { userId: auth.userId },
  });

  if (count >= MAX_PLAYLISTS) {
    return badRequest(`Maximum of ${MAX_PLAYLISTS} playlists reached`);
  }

  const playlist = await prisma.playlist.create({
    data: {
      name: stripHtml(body.name).trim(),
      description: body.description ? stripHtml(body.description).trim() || null : null,
      userId: auth.userId,
    },
    include: { _count: { select: { songs: true } } },
  });

  invalidateByPrefix(cacheKey("playlists", auth.userId));
  recordActivity({ userId: auth.userId, type: "playlist_created", playlistId: playlist.id });
  return NextResponse.json({ playlist }, { status: 201 });
}, { route: "/api/playlists", body: createPlaylistBody });
