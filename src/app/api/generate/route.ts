import * as Sentry from "@sentry/nextjs";
import {
  generateSong,
  SunoApiError,
  getRemainingCredits,
  mockSongs,
  resolveUserApiKeyWithMode,
} from "@/lib/sunoapi";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { badRequest } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import { executeGeneration, respondToGeneration } from "@/lib/generation";
import { authRoute } from "@/lib/route-handler";

export const POST = authRoute(async (_request, { auth }) => {
  const { userId, isAdmin } = auth;

  const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);

  const body = await _request.json();
  const { prompt, title, tags, makeInstrumental, personaId, parentSongId } = body;

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

  return respondToGeneration(
    outcome,
    { label: "generate-api", userId, route: "/api/generate", params: generationParams },
    {
      arrayFormat: true,
      creditBalanceLookup: outcome.status === "failed" && outcome.rawError instanceof SunoApiError && outcome.rawError.status === 402
        ? () => getRemainingCredits().catch(() => undefined)
        : undefined,
    },
  );
}, { route: "/api/generate" });
