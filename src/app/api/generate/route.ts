import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth";
import { generateSong, SunoApiError, getRemainingCredits } from "@/lib/sunoapi";
import { CircuitOpenError, onCircuitClose } from "@/lib/circuit-breaker";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { SUNOAPI_KEY } from "@/lib/env";
import { badRequest, internalError, ErrorCode } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import { recordGenerationStart, recordGenerationEnd } from "@/lib/metrics";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { drainGenerationQueue } from "@/lib/queue-processor";
import { executeGeneration } from "@/lib/generation";

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

    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);
    const skipGuards = isAdmin || usingPersonalKey;

    let outcome;
    try {
      outcome = await executeGeneration({
        userId,
        action: "generate",
        songParams: {
          title: generationParams.title || null,
          prompt: generationParams.prompt,
          tags: generationParams.style || null,
          isInstrumental: Boolean(makeInstrumental),
          parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
        },
        hasApiKey,
        mockFallback: mockSongs[0],
        skipCreditCheck: usingPersonalKey,
        skipCreditRecording: usingPersonalKey,
        skipRateLimit: skipGuards,
        description: `Song generation: ${generationParams.title || "Untitled"}`,
        rethrow: (err) => err instanceof CircuitOpenError,
        apiCall: () => {
          const genStartMs = Date.now();
          recordGenerationStart();
          logger.info({ userId, title: generationParams.title, instrumental: generationParams.instrumental }, "generation: started");

          return Sentry.startSpan(
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
          ).then((result) => {
            const genMs = Date.now() - genStartMs;
            recordGenerationEnd(genMs, true);
            logger.info({ userId, taskId: result.taskId, durationMs: genMs }, "generation: api call succeeded");
            return result;
          });
        },
      });
    } catch (circuitError) {
      if (!(circuitError instanceof CircuitOpenError)) throw circuitError;

      recordGenerationEnd(0, false);
      logger.warn({ userId }, "generation: circuit open — queuing request");

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

    if (outcome.status === "denied") return outcome.response;

    if (outcome.status === "created") {
      try {
        const [placeholderVariant] = generateCoverArtVariants({
          songId: outcome.song.id,
          title: generationParams.title,
          tags: generationParams.style,
        });
        prisma.song.update({
          where: { id: outcome.song.id },
          data: { imageUrl: placeholderVariant.dataUrl },
        }).catch(() => {});
      } catch {
        // Non-critical
      }

      invalidateByPrefix(`dashboard-stats:${userId}`);

      return NextResponse.json(
        { songs: [outcome.song], rateLimit: outcome.rateLimitStatus },
        { status: 201 }
      );
    }

    // status === "failed"
    const correlationId = logServerError("generate-api", outcome.rawError, {
      userId,
      route: "/api/generate",
      params: generationParams,
    });
    recordGenerationEnd(0, false);

    let creditBalance: number | undefined;
    if (outcome.rawError instanceof SunoApiError && outcome.rawError.status === 402) {
      creditBalance = await getRemainingCredits().catch(() => undefined);
    }

    return NextResponse.json(
      {
        songs: [outcome.song],
        error: outcome.error,
        ...(creditBalance !== undefined && { creditBalance }),
        rateLimit: outcome.rateLimitStatus,
        correlationId,
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("generate-route", error, { route: "/api/generate" });
    return internalError();
  }
}
