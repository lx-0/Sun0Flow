import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { resolveUser } from "@/lib/auth-resolver";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { prisma } from "@/lib/prisma";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { mockSongs } from "@/lib/sunoapi/mock";
import { recordCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { badRequest, internalError } from "@/lib/api-error";
import { stripHtml } from "@/lib/sanitize";
import {
  checkCreditBalance,
  createMockSongRecord,
  createPendingSongRecord,
  createFailedSongRecord,
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
      const denied = await checkCreditBalance(userId, "generate", configs.length);
      if (denied) return denied;
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

      const songParams = {
        title: genParams.title || null,
        prompt: genParams.prompt,
        tags: genParams.style || null,
        isInstrumental: genParams.instrumental,
        batchId,
      };

      if (!hasApiKey) {
        const song = await createMockSongRecord(
          userId,
          mockSongs[i % mockSongs.length],
          songParams
        );
        results.push({
          index: i,
          songId: song.id,
          sunoJobId: null,
          status: "ready",
        });
        continue;
      }

      try {
        logger.info(
          { userId, batchId, index: i, title: genParams.title },
          "batch-generate: starting generation"
        );

        const result = await Sentry.startSpan(
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
        );

        const song = await createPendingSongRecord(userId, result.taskId, songParams);

        results.push({
          index: i,
          songId: song.id,
          sunoJobId: result.taskId,
          status: "pending",
        });

        if (!usingPersonalKey) {
          await recordCreditUsage(userId, "generate", {
            songId: song.id,
            creditCost: CREDIT_COSTS.generate,
            description: `Batch generation ${i + 1}/${configs.length}: ${genParams.title || "Untitled"}`,
          });
        }
      } catch (apiError) {
        const errorMsg =
          apiError instanceof SunoApiError
            ? `Generation failed: ${apiError.message}`
            : "Song generation failed";

        logServerError("batch-generate", apiError, {
          userId,
          route: "/api/songs/batch-generate",
          params: { batchId, index: i },
        });

        const song = await createFailedSongRecord(userId, errorMsg, songParams);

        results.push({
          index: i,
          songId: song.id,
          sunoJobId: null,
          status: "failed",
          error: errorMsg,
        });
      }
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
          totalCreditCost: succeeded * CREDIT_COSTS.generate,
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
