import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong, SunoApiError, getRemainingCredits } from "@/lib/sunoapi";
import { CircuitOpenError, onCircuitClose } from "@/lib/circuit-breaker";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { releaseRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { SUNOAPI_KEY } from "@/lib/env";
import { CREDIT_COSTS } from "@/lib/credits";
import { badRequest, internalError, ErrorCode } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import { recordGenerationStart, recordGenerationEnd } from "@/lib/metrics";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { drainGenerationQueue } from "@/lib/queue-processor";
import {
  userFriendlyError,
  enforceRateLimit,
  checkCreditBalance,
  recordCreditsAndNotify,
  createMockSongRecord,
  createPendingSongRecord,
  createFailedSongRecord,
} from "@/lib/generation";

onCircuitClose(() => {
  drainGenerationQueue().catch((err) => {
    logger.error({ err }, "generation: queue drain failed after circuit close");
  });
});

export async function POST(request: Request) {
  try {
    const { userId, isAdmin, error: authError } = await resolveUser(request);

    if (authError) return authError;

    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);

    let rateLimitStatus;
    if (!isAdmin && !usingPersonalKey) {
      const result = await enforceRateLimit(userId);
      if (result.limited) return result.response;
      rateLimitStatus = result.status;
    }

    const { prompt, title, tags, makeInstrumental, personaId, parentSongId } = await request.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return badRequest("A style/genre prompt is required");
    }

    if (prompt.length > 3000) {
      return badRequest("Prompt must be 3000 characters or less");
    }

    if (title && (typeof title !== "string" || title.length > 200)) {
      return badRequest("Title must be 200 characters or less");
    }

    if (tags && (typeof tags !== "string" || tags.length > 500)) {
      return badRequest("Tags must be 500 characters or less");
    }

    const generationParams = {
      prompt: stripHtml(prompt).trim(),
      title: title ? stripHtml(title).trim() || undefined : undefined,
      style: tags ? stripHtml(tags).trim() || undefined : undefined,
      instrumental: Boolean(makeInstrumental),
    };

    if (!usingPersonalKey) {
      const denied = await checkCreditBalance(userId, "generate");
      if (denied) return denied;
    }

    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);
    const songParams = {
      title: generationParams.title || null,
      prompt: generationParams.prompt,
      tags: generationParams.style || null,
      isInstrumental: Boolean(makeInstrumental),
      parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
    };

    let savedSongs;
    if (!hasApiKey) {
      const song = await createMockSongRecord(userId, mockSongs[0], songParams);
      savedSongs = [song];
    } else {
      try {
        const genStartMs = Date.now();
        recordGenerationStart();
        logger.info({ userId, title: generationParams.title, instrumental: generationParams.instrumental }, "generation: started");

        const result = await Sentry.startSpan(
          { name: "suno.generateSong", op: "http.client", attributes: { "generation.instrumental": generationParams.instrumental } },
          () => generateSong(
            generationParams.prompt,
            {
              title: generationParams.title,
              style: generationParams.style,
              instrumental: generationParams.instrumental,
              personaId: personaId || undefined,
            },
            userApiKey
          )
        );
        const genMs = Date.now() - genStartMs;
        recordGenerationEnd(genMs, true);
        logger.info({ userId, taskId: result.taskId, durationMs: genMs }, "generation: api call succeeded");

        const song = await createPendingSongRecord(userId, result.taskId, songParams);

        try {
          const [placeholderVariant] = generateCoverArtVariants({
            songId: song.id,
            title: generationParams.title,
            tags: generationParams.style,
          });
          prisma.song.update({
            where: { id: song.id },
            data: { imageUrl: placeholderVariant.dataUrl },
          }).catch(() => {});
        } catch {
          // Non-critical
        }

        savedSongs = [song];
      } catch (apiError) {
        if (apiError instanceof CircuitOpenError) {
          recordGenerationEnd(0, false);
          logger.warn({ userId }, "generation: circuit open — queuing request");

          if (!isAdmin && !usingPersonalKey) {
            await releaseRateLimitSlot(userId).catch(() => {});
          }

          const maxPos = await prisma.generationQueueItem.aggregate({
            _max: { position: true },
            where: { userId, status: "pending" },
          });
          const position = (maxPos._max.position ?? 0) + 1;

          await prisma.generationQueueItem.create({
            data: {
              userId,
              prompt: generationParams.prompt,
              title: generationParams.title ?? null,
              tags: generationParams.style ?? null,
              makeInstrumental: Boolean(makeInstrumental),
              personaId: typeof personaId === "string" ? personaId : null,
              status: "pending",
              position,
            },
          });

          return NextResponse.json(
            {
              queued: true,
              message: "Music generation is temporarily unavailable. Your request has been queued and will be processed automatically when the service recovers.",
              code: ErrorCode.SERVICE_UNAVAILABLE,
            },
            { status: 503 }
          );
        }

        recordGenerationEnd(0, false);
        const correlationId = logServerError("generate-api", apiError, {
          userId,
          route: "/api/generate",
          params: generationParams,
        });

        if (!isAdmin && !usingPersonalKey) {
          await releaseRateLimitSlot(userId).catch(() => {});
        }

        const { message: errorMsg, code: errorCode, details: errorDetails } = userFriendlyError(apiError);
        const song = await createFailedSongRecord(userId, errorMsg, songParams);
        savedSongs = [song];

        let creditBalance: number | undefined;
        if (apiError instanceof SunoApiError && apiError.status === 402) {
          creditBalance = await getRemainingCredits().catch(() => undefined);
        }

        return NextResponse.json(
          {
            songs: savedSongs,
            error: errorMsg,
            code: errorCode,
            ...(errorDetails && { details: errorDetails }),
            ...(creditBalance !== undefined && { creditBalance }),
            rateLimit: rateLimitStatus,
            correlationId,
          },
          { status: 201 }
        );
      }
    }

    if (!usingPersonalKey) {
      await recordCreditsAndNotify(userId, "generate", {
        songId: savedSongs[0]?.id,
        description: `Song generation: ${generationParams.title || "Untitled"}`,
      });
    }

    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json(
      { songs: savedSongs, rateLimit: rateLimitStatus },
      { status: 201 }
    );
  } catch (error) {
    logServerError("generate-route", error, { route: "/api/generate" });
    return internalError();
  }
}
