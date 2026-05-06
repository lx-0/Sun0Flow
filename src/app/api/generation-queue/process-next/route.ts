import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError, getRemainingCredits } from "@/lib/sunoapi";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { mockSongs } from "@/lib/sunoapi/mock";
import { logServerError } from "@/lib/error-logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { rateLimited, internalError } from "@/lib/api-error";
import { invalidateByPrefix } from "@/lib/cache";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import {
  executeGeneration,
  userFriendlyError,
} from "@/lib/generation";

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const processing = await prisma.generationQueueItem.findFirst({
      where: { userId, status: "processing" },
    });
    if (processing) {
      return NextResponse.json({
        message: "Already processing",
        item: processing,
      });
    }

    const nextItem = await prisma.generationQueueItem.findFirst({
      where: { userId, status: "pending" },
      orderBy: { position: "asc" },
    });

    if (!nextItem) {
      return NextResponse.json({ message: "Queue empty", item: null });
    }

    const { acquired, status: rateLimitStatus } =
      await acquireRateLimitSlot(userId);
    if (!acquired) {
      return rateLimited(
        `Rate limit exceeded. Resets at ${rateLimitStatus.resetAt}`,
        { rateLimit: rateLimitStatus }
      );
    }

    await prisma.generationQueueItem.update({
      where: { id: nextItem.id },
      data: { status: "processing" },
    });

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title: nextItem.title || null,
        prompt: nextItem.prompt,
        tags: nextItem.tags || null,
        isInstrumental: nextItem.makeInstrumental,
      },
      hasApiKey,
      mockFallback: mockSongs[0],
      guards: "pre-authorized",
      description: `Song generation (queued): ${nextItem.title || "Untitled"}`,
      apiCall: () =>
        generateSong(
          nextItem.prompt,
          {
            title: nextItem.title || undefined,
            style: nextItem.tags || undefined,
            instrumental: nextItem.makeInstrumental,
            personaId: nextItem.personaId || undefined,
          },
          userApiKey
        ),
    });

    if (outcome.status === "denied") {
      await prisma.generationQueueItem.update({
        where: { id: nextItem.id },
        data: { status: "failed", errorMessage: "Generation denied" },
      });
      return outcome.response;
    }

    if (outcome.status === "failed") {
      const correlationId = logServerError("queue-process", outcome.rawError, {
        userId,
        route: "/api/generation-queue/process-next",
        params: { queueItemId: nextItem.id },
      });
      const { code: errorCode, details: errorDetails } = userFriendlyError(outcome.rawError);

      await prisma.generationQueueItem.update({
        where: { id: nextItem.id },
        data: { status: "failed", songId: outcome.song.id, errorMessage: outcome.error },
      });

      let creditBalance: number | undefined;
      if (outcome.rawError instanceof SunoApiError && outcome.rawError.status === 402) {
        creditBalance = await getRemainingCredits().catch(() => undefined);
      }

      return NextResponse.json(
        {
          item: { ...nextItem, status: "failed", songId: outcome.song.id, errorMessage: outcome.error },
          song: outcome.song,
          error: outcome.error,
          code: errorCode,
          ...(errorDetails && { details: errorDetails }),
          ...(creditBalance !== undefined && { creditBalance }),
          correlationId,
        },
        { status: 201 }
      );
    }

    const queueStatus = outcome.song.generationStatus === "ready" ? "done" : "processing";
    await prisma.generationQueueItem.update({
      where: { id: nextItem.id },
      data: { songId: outcome.song.id, status: queueStatus },
    });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json(
      { item: { ...nextItem, status: queueStatus, songId: outcome.song.id }, song: outcome.song },
      { status: 201 }
    );
  } catch (error) {
    logServerError("queue-process-route", error, { route: "/api/generation-queue/process-next" });
    return internalError();
  }
}
