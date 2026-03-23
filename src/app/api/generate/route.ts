import { NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { prisma } from "@/lib/prisma";
import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { invalidateByPrefix } from "@/lib/cache";
import { SUNOAPI_KEY } from "@/lib/env";
import { recordCreditUsage, shouldNotifyLowCredits, createLowCreditNotification, getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";

/** Map API errors to user-friendly messages, including Suno status for debugging */
function userFriendlyError(error: unknown): string {
  if (error instanceof SunoApiError) {
    if (error.status === 429) return `The music generation service is busy (Suno 429). Please try again in a few minutes.`;
    if (error.status === 400) return `Invalid generation parameters (Suno 400). Please adjust your prompt and try again.`;
    if (error.status === 401 || error.status === 403) return `API authentication failed (Suno ${error.status}). Please check your API key in settings.`;
    if (error.status >= 500) return `The music generation service is temporarily unavailable (Suno ${error.status}). Please try again later.`;
    return `Generation failed (Suno ${error.status}): ${error.message}`;
  }
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return "Could not reach the music generation service. Please check your connection and try again.";
  }
  return "Song generation failed. Please try again.";
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);

    if (authError) return authError;

    // Atomically check and claim a rate limit slot
    const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
    if (!acquired) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((new Date(rateLimitStatus.resetAt).getTime() - Date.now()) / 1000)
      );
      return NextResponse.json(
        {
          error: `Rate limit exceeded. You can generate up to ${rateLimitStatus.limit} songs per hour.`,
          resetAt: rateLimitStatus.resetAt,
          rateLimit: rateLimitStatus,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        }
      );
    }

    const { prompt, title, tags, makeInstrumental, personaId } = await request.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "A style/genre prompt is required" },
        { status: 400 }
      );
    }

    if (prompt.length > 3000) {
      return NextResponse.json(
        { error: "Prompt must be 3000 characters or less" },
        { status: 400 }
      );
    }

    if (title && (typeof title !== "string" || title.length > 200)) {
      return NextResponse.json(
        { error: "Title must be 200 characters or less" },
        { status: 400 }
      );
    }

    if (tags && (typeof tags !== "string" || tags.length > 500)) {
      return NextResponse.json(
        { error: "Tags must be 500 characters or less" },
        { status: 400 }
      );
    }

    const generationParams = {
      prompt: prompt.trim(),
      title: title?.trim() || undefined,
      style: tags?.trim() || undefined,
      instrumental: Boolean(makeInstrumental),
    };

    const userApiKey = await resolveUserApiKey(userId);

    // If no API key at all (env or user), fall back to mock for demo mode
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    let savedSongs;
    if (!hasApiKey) {
      const mock = mockSongs[0];
      const song = await prisma.song.create({
        data: {
          userId,
          title: mock.title || title?.trim() || null,
          prompt: prompt.trim(),
          tags: mock.tags || tags?.trim() || null,
          audioUrl: mock.audioUrl || null,
          imageUrl: mock.imageUrl || null,
          duration: mock.duration ?? null,
          lyrics: mock.lyrics || null,
          sunoModel: mock.model || null,
          isInstrumental: Boolean(makeInstrumental),
          generationStatus: "ready",
        },
      });
      savedSongs = [song];
    } else {
      try {
        const result = await generateSong(
          generationParams.prompt,
          {
            title: generationParams.title,
            style: generationParams.style,
            instrumental: generationParams.instrumental,
            personaId: personaId || undefined,
          },
          userApiKey
        );

        const song = await prisma.song.create({
          data: {
            userId,
            sunoJobId: result.taskId,
            title: title?.trim() || null,
            prompt: prompt.trim(),
            tags: tags?.trim() || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "pending",
          },
        });

        savedSongs = [song];
      } catch (apiError) {
        logServerError("generate-api", apiError, {
          userId,
          route: "/api/generate",
          params: generationParams,
        });

        // Save a failed record so the user can see it in history and retry
        const errorMsg = userFriendlyError(apiError);
        const song = await prisma.song.create({
          data: {
            userId,
            title: title?.trim() || null,
            prompt: prompt.trim(),
            tags: tags?.trim() || null,
            isInstrumental: Boolean(makeInstrumental),
            generationStatus: "failed",
            errorMessage: errorMsg,
          },
        });

        savedSongs = [song];

        // Rate limit slot already claimed above — just return current status
        return NextResponse.json(
          { songs: savedSongs, error: errorMsg, rateLimit: rateLimitStatus },
          { status: 201 }
        );
      }
    }

    // Record credit usage for this generation
    const songId = savedSongs[0]?.id;
    await recordCreditUsage(userId, "generate", {
      songId,
      creditCost: CREDIT_COSTS.generate,
      description: `Song generation: ${title?.trim() || "Untitled"}`,
    });

    // Check if user should be warned about low credits
    try {
      const shouldNotify = await shouldNotifyLowCredits(userId);
      if (shouldNotify) {
        const usage = await getMonthlyCreditUsage(userId);
        await createLowCreditNotification(userId, usage.creditsRemaining);
      }
    } catch {
      // Non-critical — don't block generation
    }

    // Rate limit slot already claimed above
    invalidateByPrefix(`dashboard-stats:${userId}`);

    return NextResponse.json(
      { songs: savedSongs, rateLimit: rateLimitStatus },
      { status: 201 }
    );
  } catch (error) {
    logServerError("generate-route", error, {
      route: "/api/generate",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
