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
import { executeGeneration, respondToGeneration } from "@/lib/generation";
import {
  generateSongRequestSchema,
  sanitizeGenerateSongRequest,
} from "@/lib/generation/request";
import { authRoute } from "@/lib/route-handler";

export const POST = authRoute(async (_request, { auth, body }) => {
  const { userId, isAdmin } = auth;

  const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
  const generationParams = sanitizeGenerateSongRequest(body);

  const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

  const outcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title: generationParams.title || null,
      prompt: generationParams.prompt,
      tags: generationParams.style || null,
      isInstrumental: generationParams.instrumental,
      parentSongId: generationParams.parentSongId ?? null,
      personaId: generationParams.personaId ?? null,
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
            personaId: generationParams.personaId,
          },
          userApiKey
        )
      );
    },
  });

  return respondToGeneration(
    outcome,
    { label: "generate-api", userId, route: "/api/generate", params: { ...generationParams } },
    {
      arrayFormat: true,
      creditBalanceLookup: outcome.status === "failed" && outcome.rawError instanceof SunoApiError && outcome.rawError.status === 402
        ? () => getRemainingCredits().catch(() => undefined)
        : undefined,
    },
  );
}, { body: generateSongRequestSchema, route: "/api/generate" });
