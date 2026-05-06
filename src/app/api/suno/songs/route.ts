import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { listSongs } from "@/lib/sunoapi/songs";
import { SunoApiError } from "@/lib/sunoapi/errors";
import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { apiError, internalError, ErrorCode } from "@/lib/api-error";
import { CacheControl } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const apiKey = await resolveUserApiKey(userId!);
    if (!apiKey) {
      return apiError("No Suno API key configured", ErrorCode.VALIDATION_ERROR, 400);
    }

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(params.get("limit") || "20", 10) || 20));

    // Fetch all remote songs from Suno API
    const remoteSongs = await listSongs(apiKey);

    // Cross-reference local DB to flag already-imported songs
    const sunoJobIds = remoteSongs.map((s) => s.id).filter(Boolean);
    const importedSet = new Set<string>();
    if (sunoJobIds.length > 0) {
      const imported = await prisma.song.findMany({
        where: { userId: userId!, sunoJobId: { in: sunoJobIds } },
        select: { sunoJobId: true },
      });
      for (const row of imported) {
        if (row.sunoJobId) importedSet.add(row.sunoJobId);
      }
    }

    // Map to frontend-friendly shape
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

    // Offset-based pagination
    const total = mapped.length;
    const offset = (page - 1) * limit;
    const paginated = mapped.slice(offset, offset + limit);
    const hasMore = offset + paginated.length < total;

    return NextResponse.json(
      {
        songs: paginated,
        pagination: { page, limit, total, hasMore },
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
}
