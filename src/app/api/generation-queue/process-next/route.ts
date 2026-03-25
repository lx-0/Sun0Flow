import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { mockSongs } from "@/lib/sunoapi/mock";
import { logServerError } from "@/lib/error-logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { rateLimited, internalError, ErrorCode } from "@/lib/api-error";
import {
  recordCreditUsage,
  shouldNotifyLowCredits,
  createLowCreditNotification,
  getMonthlyCreditUsage,
  CREDIT_COSTS,
} from "@/lib/credits";
import { invalidateByPrefix } from "@/lib/cache";

function userFriendlyError(error: unknown): { message: string; code: string } {
  if (error instanceof SunoApiError) {
    if (error.status === 429)
      return { message: "The music generation service is busy. Please try again in a few minutes.", code: ErrorCode.SUNO_RATE_LIMIT };
    if (error.status === 400)
      return { message: "Invalid generation parameters. Please adjust your prompt and try again.", code: ErrorCode.VALIDATION_ERROR };
    if (error.status === 401 || error.status === 403)
      return { message: "API authentication failed. Please check your API key in settings.", code: ErrorCode.SUNO_AUTH_ERROR };
    if (error.status >= 500)
      return { message: "The music generation service is temporarily unavailable — please try again in a moment.", code: ErrorCode.SERVICE_UNAVAILABLE };
    return { message: `Generation failed: ${error.message}`, code: ErrorCode.SUNO_API_ERROR };
  }
  return { message: "Song generation failed. Please try again.", code: ErrorCode.INTERNAL_ERROR };
}

/**
 * POST: Process the next pending queue item for the current user.
 * Called automatically when a generation completes, or manually.
 */
export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    // Check if there's already a processing item
    const processing = await prisma.generationQueueItem.findFirst({
      where: { userId, status: "processing" },
    });
    if (processing) {
      return NextResponse.json({
        message: "Already processing",
        item: processing,
      });
    }

    // Get next pending item
    const nextItem = await prisma.generationQueueItem.findFirst({
      where: { userId, status: "pending" },
      orderBy: { position: "asc" },
    });

    if (!nextItem) {
      return NextResponse.json({ message: "Queue empty", item: null });
    }

    // Rate limit check
    const { acquired, status: rateLimitStatus } =
      await acquireRateLimitSlot(userId);
    if (!acquired) {
      return rateLimited(
        `Rate limit exceeded. Resets at ${rateLimitStatus.resetAt}`,
        { rateLimit: rateLimitStatus }
      );
    }

    // Mark as processing
    await prisma.generationQueueItem.update({
      where: { id: nextItem.id },
      data: { status: "processing" },
    });

    const userApiKey = await resolveUserApiKey(userId);
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    let song;

    if (!hasApiKey) {
      // Mock mode
      const mock = mockSongs[0];
      song = await prisma.song.create({
        data: {
          userId,
          title: mock.title || nextItem.title || null,
          prompt: nextItem.prompt,
          tags: mock.tags || nextItem.tags || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: nextItem.makeInstrumental,
          generationStatus: "ready",
        },
      });
    } else {
      try {
        const result = await generateSong(
          nextItem.prompt,
          {
            title: nextItem.title || undefined,
            style: nextItem.tags || undefined,
            instrumental: nextItem.makeInstrumental,
            personaId: nextItem.personaId || undefined,
          },
          userApiKey
        );

        song = await prisma.song.create({
          data: {
            userId,
            sunoJobId: result.taskId,
            title: nextItem.title || null,
            prompt: nextItem.prompt,
            tags: nextItem.tags || null,
            isInstrumental: nextItem.makeInstrumental,
            generationStatus: "pending",
          },
        });
      } catch (apiError) {
        const correlationId = logServerError("queue-process", apiError, {
          userId,
          route: "/api/generation-queue/process-next",
          params: { queueItemId: nextItem.id },
        });
        const { message: errorMsg, code: errorCode } = userFriendlyError(apiError);

        song = await prisma.song.create({
          data: {
            userId,
            title: nextItem.title || null,
            prompt: nextItem.prompt,
            tags: nextItem.tags || null,
            isInstrumental: nextItem.makeInstrumental,
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        await prisma.generationQueueItem.update({
          where: { id: nextItem.id },
          data: { status: "failed", songId: song.id, errorMessage: errorMsg },
        });

        return NextResponse.json(
          {
            item: { ...nextItem, status: "failed", songId: song.id, errorMessage: errorMsg },
            song,
            error: errorMsg,
            code: errorCode,
            correlationId,
          },
          { status: 201 }
        );
      }
    }

    // Link song to queue item and mark done (or processing if still pending)
    const queueStatus = song.generationStatus === "ready" ? "done" : "processing";
    await prisma.generationQueueItem.update({
      where: { id: nextItem.id },
      data: { songId: song.id, status: queueStatus },
    });

    // Record credit usage
    await recordCreditUsage(userId, "generate", {
      songId: song.id,
      creditCost: CREDIT_COSTS.generate,
      description: `Song generation (queued): ${nextItem.title || "Untitled"}`,
    });

    try {
      const shouldNotify = await shouldNotifyLowCredits(userId);
      if (shouldNotify) {
        const usage = await getMonthlyCreditUsage(userId);
        await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
      }
    } catch {
      // Non-critical
    }

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ item: { ...nextItem, status: queueStatus, songId: song.id }, song }, { status: 201 });
  } catch (error) {
    logServerError("queue-process-route", error, { route: "/api/generation-queue/process-next" });
    return internalError();
  }
}
