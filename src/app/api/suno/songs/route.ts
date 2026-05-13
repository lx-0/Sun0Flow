import { NextResponse } from "next/server";
import { z } from "zod";
import { authRoute } from "@/lib/route-handler";
import { resolveUserApiKey, listSongs, SunoApiError } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { apiError, internalError, ErrorCode } from "@/lib/api-error";
import { CacheControl } from "@/lib/cache";
import { zLimitParam, zPageParam } from "@/lib/query-params";

const sunoSongsQuerySchema = z.object({
  page: zPageParam(1),
  limit: zLimitParam(20, 100),
});

export const GET = authRoute(async (_request, { auth, query }) => {
  try {
    const apiKey = await resolveUserApiKey(auth.userId);
    if (!apiKey) {
      return apiError("No Suno API key configured", ErrorCode.VALIDATION_ERROR, 400);
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
    if (error instanceof SunoApiError) {
      if (error.status === 401) {
        return apiError("Invalid Suno API key", ErrorCode.SUNO_AUTH_ERROR, 401);
      }
      if (error.status === 404) {
        return apiError(
          "Song listing is not supported by the current API provider (sunoapi.org). This endpoint does not exist in their API.",
          ErrorCode.SUNO_API_ERROR,
          501
        );
      }
      if (error.status === 429) {
        return apiError("Suno API rate limit exceeded. Please try again later.", ErrorCode.SUNO_RATE_LIMIT, 429);
      }
      if (error.status >= 500) {
        return apiError("Suno API is temporarily unavailable. Please try again later.", ErrorCode.SUNO_API_ERROR, 502);
      }
      const fallback = "Unable to fetch songs from Suno. Please check your API key and try again.";
      const msg = error.message && error.message !== "No message available" ? error.message : fallback;
      return apiError(msg, ErrorCode.SUNO_API_ERROR, 502);
    }
    logServerError("suno-songs-list", error, { route: "/api/suno/songs" });
    return internalError();
  }
}, { query: sunoSongsQuerySchema, route: "/api/suno/songs" });
