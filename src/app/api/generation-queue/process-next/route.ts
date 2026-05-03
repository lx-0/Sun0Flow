import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
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
  userFriendlyError,
  recordCreditsAndNotify,
  createSongRecord,
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

    const songParams = {
      title: nextItem.title || null,
      prompt: nextItem.prompt,
      tags: nextItem.tags || null,
      isInstrumental: nextItem.makeInstrumental,
    };

    let song;

    if (!hasApiKey) {
      song = await createSongRecord(userId, songParams, { status: "ready", mock: mockSongs[0] });
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

        song = await createSongRecord(userId, songParams, { status: "pending", sunoJobId: result.taskId });
      } catch (apiError) {
        const correlationId = logServerError("queue-process", apiError, {
          userId,
          route: "/api/generation-queue/process-next",
          params: { queueItemId: nextItem.id },
        });
        const { message: errorMsg, code: errorCode, details: errorDetails } = userFriendlyError(apiError);

        song = await createSongRecord(userId, songParams, { status: "failed", errorMessage: errorMsg });

        await prisma.generationQueueItem.update({
          where: { id: nextItem.id },
          data: { status: "failed", songId: song.id, errorMessage: errorMsg },
        });

        let creditBalance: number | undefined;
        if (apiError instanceof SunoApiError && apiError.status === 402) {
          creditBalance = await getRemainingCredits().catch(() => undefined);
        }

        return NextResponse.json(
          {
            item: { ...nextItem, status: "failed", songId: song.id, errorMessage: errorMsg },
            song,
            error: errorMsg,
            code: errorCode,
            ...(errorDetails && { details: errorDetails }),
            ...(creditBalance !== undefined && { creditBalance }),
            correlationId,
          },
          { status: 201 }
        );
      }
    }

    const queueStatus = song.generationStatus === "ready" ? "done" : "processing";
    await prisma.generationQueueItem.update({
      where: { id: nextItem.id },
      data: { songId: song.id, status: queueStatus },
    });

    await recordCreditsAndNotify(userId, "generate", {
      songId: song.id,
      description: `Song generation (queued): ${nextItem.title || "Untitled"}`,
    });

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json({ item: { ...nextItem, status: queueStatus, songId: song.id }, song }, { status: 201 });
  } catch (error) {
    logServerError("queue-process-route", error, { route: "/api/generation-queue/process-next" });
    return internalError();
  }
}
