import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { generateSong, resolveUserApiKeyWithMode, mockSongs } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { checkCredits, getCreditCost } from "@/lib/credits";
import { stripHtml } from "@/lib/sanitize";
import { type Result, success, fail } from "@/lib/result";
import { executeGeneration, type GenerationOutcome } from "./execute";

const MIN_BATCH = 2;
const MAX_BATCH = 5;

// ── Types ───────────────────────────────────────────────────────────────

export interface BatchConfig {
  prompt: string;
  title?: string;
  style?: string;
  model?: string;
  makeInstrumental?: boolean;
}

export interface BatchItemResult {
  index: number;
  songId: string;
  sunoJobId: string | null;
  status: "pending" | "ready" | "failed";
  error?: string;
}

export interface BatchGenerationData {
  batchId: string;
  results: BatchItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    totalCreditCost: number;
  };
}

// ── Validation ──────────────────────────────────────────────────────────

function validateConfigs(configs: unknown): Result<BatchConfig[]> {
  if (!Array.isArray(configs)) {
    return fail("configs must be an array of generation configurations", "VALIDATION_ERROR", 400);
  }
  if (configs.length < MIN_BATCH || configs.length > MAX_BATCH) {
    return fail(
      `Batch size must be between ${MIN_BATCH} and ${MAX_BATCH} (got ${configs.length})`,
      "VALIDATION_ERROR",
      400,
    );
  }

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i] as BatchConfig;
    if (!c.prompt || typeof c.prompt !== "string" || !c.prompt.trim()) {
      return fail(`Config ${i + 1}: prompt is required`, "VALIDATION_ERROR", 400);
    }
    if (c.prompt.length > 3000) {
      return fail(`Config ${i + 1}: prompt must be 3000 characters or less`, "VALIDATION_ERROR", 400);
    }
    if (c.title && (typeof c.title !== "string" || c.title.length > 200)) {
      return fail(`Config ${i + 1}: title must be 200 characters or less`, "VALIDATION_ERROR", 400);
    }
    if (c.style && (typeof c.style !== "string" || c.style.length > 500)) {
      return fail(`Config ${i + 1}: style must be 500 characters or less`, "VALIDATION_ERROR", 400);
    }
  }

  return success(configs as BatchConfig[]);
}

// ── Orchestration ───────────────────────────────────────────────────────

export async function executeBatchGeneration(
  userId: string,
  rawConfigs: unknown,
): Promise<Result<BatchGenerationData>> {
  const validated = validateConfigs(rawConfigs);
  if (!validated.ok) return validated;
  const configs = validated.data;

  const { apiKey: userApiKey, usingPersonalKey } =
    await resolveUserApiKeyWithMode(userId);

  if (!usingPersonalKey) {
    const perSongCost = getCreditCost("generate");
    const totalCost = perSongCost * configs.length;
    const creditCheck = await checkCredits(userId, "generate");
    if (creditCheck.creditsRemaining < totalCost) {
      return fail(
        `Insufficient credits. You need ${totalCost} credits (${perSongCost} x ${configs.length}) but only have ${creditCheck.creditsRemaining} remaining.`,
        "INSUFFICIENT_CREDITS",
        402,
      );
    }
  }

  const batchId = randomBytes(8).toString("hex");
  const hasApiKey = !!(userApiKey || SUNOAPI_KEY);
  const results: BatchItemResult[] = [];

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
      guards: usingPersonalKey ? "personal-key" : "pre-authorized",
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
              userApiKey,
            ),
        ),
    });

    if (outcome.status === "denied") {
      results.push({ index: i, songId: "", sunoJobId: null, status: "failed", error: "denied" });
      continue;
    }

    if (outcome.status === "queued") {
      results.push({ index: i, songId: "", sunoJobId: null, status: "failed", error: "queued" });
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
    "batch-generate: completed",
  );

  return success({
    batchId,
    results,
    summary: {
      total: configs.length,
      succeeded,
      failed,
      totalCreditCost: succeeded * getCreditCost("generate"),
    },
  });
}
