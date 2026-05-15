import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { listSongs } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { CacheControl } from "@/lib/cache";
import { zLimitParam, zPageParam } from "@/lib/query-params";
import { handleSunoRouteError, resolveRequiredSunoApiKey } from "@/lib/suno-route";

const sunoSongsQuerySchema = z.object({
  page: zPageParam(1),
  limit: zLimitParam(20, 100),
});

export const GET = authRoute(async (_request, { auth, query }) => {
  try {
    const apiKey = await resolveRequiredSunoApiKey(auth.userId);
    if (apiKey instanceof Response) {
      return apiKey;
    }

    const remoteSongs = await listSongs(apiKey);

    const sunoJobIds = remoteSongs.map((s) => s.id).filter(Boolean);
    const importedSet = new Set<string>();
    if (sunoJobIds.length > 0) {
      const imported = await prisma.song.findMany({
        where: { userId: auth.userId, sunoJobId: { in: sunoJobIds } },
        select: { sunoJobId: true },
      });
      for (const row of imported) {
        if (row.sunoJobId) importedSet.add(row.sunoJobId);
      }
    }

    const mapped = remoteSongs.map((s) => ({
      id: s.id,
      title: s.title,
      audioUrl: s.audioUrl,
      imageUrl: s.imageUrl ?? null,
      duration: s.duration ?? null,
      tags: s.tags ?? null,
      prompt: s.prompt ?? null,
      lyrics: s.lyrics ?? null,
      model: s.model ?? null,
      createdAt: s.createdAt,
      status: s.status,
      alreadyImported: importedSet.has(s.id),
    }));

    const total = mapped.length;
    const offset = (query.page - 1) * query.limit;
    const paginated = mapped.slice(offset, offset + query.limit);
    const hasMore = offset + paginated.length < total;

    return NextResponse.json(
      {
        songs: paginated,
        pagination: { page: query.page, limit: query.limit, total, hasMore },
      },
      { headers: { "Cache-Control": CacheControl.privateNoCache } }
    );
  } catch (error) {
    return handleSunoRouteError(error, {
      logLabel: "suno-songs-list",
      route: "/api/suno/songs",
      mapOptions: {
        notFoundMessage: "Song listing is not supported by the current API provider (sunoapi.org). This endpoint does not exist in their API.",
        notFoundStatus: 501,
        includeRawMessageOnFallback: true,
        fallbackMessage: "Unable to fetch songs from Suno. Please check your API key and try again.",
      },
    });
  }
}, { query: sunoSongsQuerySchema, route: "/api/suno/songs" });
