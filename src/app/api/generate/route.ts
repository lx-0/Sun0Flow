import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot, releaseRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { invalidateByPrefix } from "@/lib/cache";
import { SUNOAPI_KEY } from "@/lib/env";
import { recordCreditUsage, shouldNotifyLowCredits, createLowCreditNotification, getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { badRequest, rateLimited, internalError, insufficientCredits, ErrorCode } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import { recordGenerationStart, recordGenerationEnd } from "@/lib/metrics";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";

/** Map API errors to user-friendly messages */
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
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return { message: "Could not reach the music generation service. Please check your connection and try again.", code: ErrorCode.SERVICE_UNAVAILABLE };
  }
  return { message: "Song generation failed. Please try again.", code: ErrorCode.INTERNAL_ERROR };
}

export async function POST(request: Request) {
  try {
    const { userId, isAdmin, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Resolve personal API key early so we can skip rate limits/credits if active
    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);

    // Atomically check and claim a rate limit slot (admins and personal-key users are exempt)
    let rateLimitStatus;
    if (!isAdmin && !usingPersonalKey) {
      const { acquired, status } = await acquireRateLimitSlot(userId);
      if (!acquired) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((new Date(status.resetAt).getTime() - Date.now()) / 1000)
        );
        logger.warn({ userId, action: "generate", limit: status.limit, resetAt: status.resetAt }, "rate-limit: generation limit exceeded");
        Sentry.addBreadcrumb({
          category: "rate-limit",
          message: "Generation rate limit exceeded",
          level: "warning",
          data: { userId, action: "generate", limit: status.limit, resetAt: status.resetAt },
        });
        return rateLimited(
          `Rate limit exceeded. You can generate up to ${status.limit} songs per hour.`,
          { resetAt: status.resetAt, rateLimit: status },
          { "Retry-After": String(retryAfterSec) }
        );
      }
      rateLimitStatus = status;
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

    // Check credit balance before consuming any upstream resources (skip for personal key users)
    if (!usingPersonalKey) {
      const creditUsage = await getMonthlyCreditUsage(userId);
      if (creditUsage.creditsRemaining < CREDIT_COSTS.generate) {
        return insufficientCredits(
          `Insufficient credits. You need ${CREDIT_COSTS.generate} credits but only have ${creditUsage.creditsRemaining} remaining.`
        );
      }
    }

    // If no API key at all (env or user), fall back to mock for demo mode
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    let savedSongs;
    if (!hasApiKey) {
      const mock = mockSongs[0];
      const song = await prisma.song.create({
        data: {
          userId,
          title: mock.title || generationParams.title || null,
          prompt: generationParams.prompt,
          tags: mock.tags || generationParams.style || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: Boolean(makeInstrumental),
          generationStatus: "ready",
          parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
        },
      });
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

        const song = await prisma.song.create({
          data: {
            userId,
            sunoJobId: result.taskId,
            title: generationParams.title || null,
            prompt: generationParams.prompt,
            tags: generationParams.style || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "pending",
            parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
          },
        });

        // Auto-assign a placeholder cover art so songs have a visual fingerprint
        // immediately — the Suno-returned imageUrl will overwrite this on completion.
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
          // Non-critical — generation still succeeds without a placeholder image.
        }

        savedSongs = [song];
      } catch (apiError) {
        recordGenerationEnd(0, false);
        const correlationId = logServerError("generate-api", apiError, {
          userId,
          route: "/api/generate",
          params: generationParams,
        });

        // Release the rate limit slot so the failed attempt doesn't count
        if (!isAdmin && !usingPersonalKey) {
          await releaseRateLimitSlot(userId).catch(() => {});
        }

        // Save a failed record so the user can see it in history and retry
        const { message: errorMsg, code: errorCode } = userFriendlyError(apiError);
        const song = await prisma.song.create({
          data: {
            userId,
            title: generationParams.title || null,
            prompt: generationParams.prompt,
            tags: generationParams.style || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "failed",
            errorMessage: errorMsg,
            parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
          },
        });

        savedSongs = [song];

        return NextResponse.json(
          {
            songs: savedSongs,
            error: errorMsg,
            code: errorCode,
            rateLimit: rateLimitStatus,
            correlationId,
          },
          { status: 201 }
        );
      }
    }

    // Record credit usage (skip for personal key users — they consume their own quota)
    if (!usingPersonalKey) {
      const songId = savedSongs[0]?.id;
      await recordCreditUsage(userId, "generate", {
        songId,
        creditCost: CREDIT_COSTS.generate,
        description: `Song generation: ${generationParams.title || "Untitled"}`,
      });

      // Check if user should be warned about low credits
      try {
        const shouldNotify = await shouldNotifyLowCredits(userId);
        if (shouldNotify) {
          const usage = await getMonthlyCreditUsage(userId);
          await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
        }
      } catch {
        // Non-critical — don't block generation
      }
    }

    // Rate limit slot already claimed above
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
