import { NextResponse } from "next/server";
import { authRoute, requireOwned } from "@/lib/route-handler";
import { generateSong, resolveUserApiKey } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { SUNOAPI_KEY } from "@/lib/env";
import { broadcast } from "@/lib/event-bus";
import { userFriendlyError } from "@/lib/generation";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    if (song.generationStatus !== "failed") {
      return NextResponse.json(
        { error: "Only failed songs can be retried", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(auth.userId);
    if (!acquired) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000),
      );
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
          code: "RATE_LIMIT",
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    if (!hasApiKey) {
      const updated = await prisma.song.update({
        where: { id: params.id },
        data: {
          generationStatus: "ready",
          errorMessage: null,
          pollCount: 0,
          // Un-archive — handleSongFailure set archivedAt when the song failed.
          // Without clearing it, the row stays hidden from the default library
          // view even though it is now ready again.
          archivedAt: null,
        },
      });
      broadcast(auth.userId, {
        type: "generation_update",
        data: { songId: params.id, status: "ready" },
      });
      return NextResponse.json({ song: updated, rateLimit: rateLimitStatus }, { status: 200 });
    }

    try {
      const result = await generateSong(
        song.prompt || "",
        {
          title: song.title || undefined,
          style: song.tags || undefined,
          instrumental: song.isInstrumental,
        },
        userApiKey,
      );

      const updated = await prisma.song.update({
        where: { id: params.id },
        data: {
          sunoJobId: result.taskId,
          generationStatus: "pending",
          errorMessage: null,
          pollCount: 0,
          // Un-archive — handleSongFailure set archivedAt when the song failed.
          // Without clearing it, the row stays hidden from the default library
          // view even after generation completes.
          archivedAt: null,
        },
      });

      invalidateByPrefix(`dashboard-stats:${auth.userId}`);
      broadcast(auth.userId, {
        type: "generation_update",
        data: { songId: params.id, status: "pending" },
      });

      return NextResponse.json({ song: updated, rateLimit: rateLimitStatus }, { status: 200 });
    } catch (apiError) {
      logServerError("retry-api", apiError, {
        userId: auth.userId,
        route: `/api/songs/${params.id}/retry`,
        params: { songId: params.id },
      });

      const errorMsg = userFriendlyError(apiError).message;
      const updated = await prisma.song.update({
        where: { id: params.id },
        data: {
          errorMessage: errorMsg,
        },
      });

      return NextResponse.json(
        { song: updated, error: errorMsg, rateLimit: rateLimitStatus },
        { status: 200 },
      );
    }
  },
  { route: "/api/songs/[id]/retry" },
);
