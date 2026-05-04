import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { mockSongs } from "@/lib/sunoapi/mock";
import { checkCredits, getCreditCost } from "@/lib/credits";
import { badRequest, insufficientCredits, internalError } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import {
  executeGeneration,
  type GenerationOutcome,
} from "@/lib/generation";

const MIN_BATCH = 2;
const MAX_BATCH = 5;

interface BatchGenerationConfig {
  prompt: string;
  title?: string;
  style?: string;
  model?: string;
  makeInstrumental?: boolean;
}

export async function POST(request: Request) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { apiKey: userApiKey, usingPersonalKey } =
      await resolveUserApiKeyWithMode(userId);

    const body = await request.json();
    const { configs } = body as { configs: BatchGenerationConfig[] };

    if (!Array.isArray(configs)) {
      return badRequest("configs must be an array of generation configurations");
    }
    if (configs.length < MIN_BATCH || configs.length > MAX_BATCH) {
      return badRequest(
        `Batch size must be between ${MIN_BATCH} and ${MAX_BATCH} (got ${configs.length})`
      );
    }

    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      if (!c.prompt || typeof c.prompt !== "string" || !c.prompt.trim()) {
        return badRequest(`Config ${i + 1}: prompt is required`);
      }
      if (c.prompt.length > 3000) {
        return badRequest(`Config ${i + 1}: prompt must be 3000 characters or less`);
      }
      if (c.title && (typeof c.title !== "string" || c.title.length > 200)) {
        return badRequest(`Config ${i + 1}: title must be 200 characters or less`);
      }
      if (c.style && (typeof c.style !== "string" || c.style.length > 500)) {
        return badRequest(`Config ${i + 1}: style must be 500 characters or less`);
      }
    }

    if (!usingPersonalKey) {
      const perSongCost = getCreditCost("generate");
      const totalCost = perSongCost * configs.length;
      const creditCheck = await checkCredits(userId, "generate");
      if (creditCheck.creditsRemaining < totalCost) {
        return insufficientCredits(
          `Insufficient credits. You need ${totalCost} credits (${perSongCost} x ${configs.length}) but only have ${creditCheck.creditsRemaining} remaining.`
        );
      }
    }

    const batchId = randomBytes(8).toString("hex");
    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    const results: Array<{
      index: number;
      songId: string;
      sunoJobId: string | null;
      status: "pending" | "ready" | "failed";
      error?: string;
    }> = [];

    for (let i = 0; i < configs.length; i++) {
      const c = configs[i];
      const genParams = {
        prompt: stripHtml(c.prompt).trim(),
        title: c.title ? stripHtml(c.title).trim() || undefined : undefined,
        style: c.style ? stripHtml(c.style).trim() || undefined : undefined,
        instrumental: Boolean(c.makeInstrumental),
      };

      const outcome: GenerationOutcome = await executeGeneration({
        userId,
        action: "generate",
        songParams: {
          title: genParams.title || null,
          prompt: genParams.prompt,
          tags: genParams.style || null,
          isInstrumental: genParams.instrumental,
          batchId,
        },
        hasApiKey,
        mockFallback: mockSongs[i % mockSongs.length],
        skipCreditCheck: true,
        skipCreditRecording: usingPersonalKey,
        skipRateLimit: true,
        description: `Batch generation ${i + 1}/${configs.length}: ${genParams.title || "Untitled"}`,
        apiCall: () =>
          Sentry.startSpan(
            {
              name: "suno.generateSong.batch",
              op: "http.client",
              attributes: { "batch.index": i, "batch.id": batchId },
            },
            () =>
              generateSong(
                genParams.prompt,
                {
                  title: genParams.title,
                  style: genParams.style,
                  instrumental: genParams.instrumental,
                  model: (c.model as never) || undefined,
                },
                userApiKey
              )
          ),
      });

      if (outcome.status === "denied") {
        results.push({ index: i, songId: "", sunoJobId: null, status: "failed", error: "denied" });
        continue;
      }

      if (outcome.status === "failed") {
        logServerError("batch-generate", outcome.rawError, {
          userId,
          route: "/api/songs/batch-generate",
          params: { batchId, index: i },
        });
        results.push({
          index: i,
          songId: outcome.song.id,
          sunoJobId: null,
          status: "failed",
          error: outcome.error,
        });
        continue;
      }

      results.push({
        index: i,
        songId: outcome.song.id,
        sunoJobId: outcome.song.sunoJobId ?? null,
        status: outcome.song.generationStatus as "pending" | "ready",
      });
    }

    const succeeded = results.filter((r) => r.status !== "failed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    logger.info(
      { userId, batchId, total: configs.length, succeeded, failed },
      "batch-generate: completed"
    );

    return NextResponse.json(
      {
        batchId,
        results,
        summary: {
          total: configs.length,
          succeeded,
          failed,
          totalCreditCost: succeeded * getCreditCost("generate"),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("batch-generate-route", error, {
      route: "/api/songs/batch-generate",
    });
    return internalError();
  }
}
