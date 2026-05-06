import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth";
import { generateSong, SunoApiError, getRemainingCredits } from "@/lib/sunoapi";
import { mockSongs } from "@/lib/sunoapi/mock";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { badRequest, internalError, ErrorCode } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import { executeGeneration } from "@/lib/generation";

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

    const outcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title: generationParams.title || null,
        prompt: generationParams.prompt,
        tags: generationParams.style || null,
        isInstrumental: Boolean(makeInstrumental),
        parentSongId: typeof parentSongId === "string" && parentSongId ? parentSongId : null,
        personaId: typeof personaId === "string" ? personaId : null,
      },
      hasApiKey,
      mockFallback: mockSongs[0],
      guards: usingPersonalKey ? "personal-key" : isAdmin ? "admin" : "standard",
      description: `Song generation: ${generationParams.title || "Untitled"}`,
      coverArt: true,
      apiCall: () => {
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
        );
      },
    });

    if (outcome.status === "denied") return outcome.response;

    if (outcome.status === "queued") {
      return NextResponse.json(
        { queued: true, message: outcome.message, code: ErrorCode.SERVICE_UNAVAILABLE },
        { status: 503 }
      );
    }

    if (outcome.status === "created") {
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
