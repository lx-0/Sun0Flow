import { randomBytes } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { generateSong, resolveUserApiKeyWithMode, mockSongs } from "@/lib/sunoapi";
import { logServerError } from "@/lib/error-logger";
import { logger } from "@/lib/logger";
import { SUNOAPI_KEY } from "@/lib/env";
import { checkCredits, getCreditCost } from "@/lib/credits";
import { type Result, success, fail } from "@/lib/result";
import { executeGeneration, type GenerationOutcome } from "./execute";
import { validateAndSanitizeBatchGenerationConfigs } from "./params";

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

// ── Orchestration ───────────────────────────────────────────────────────

export async function executeBatchGeneration(
  userId: string,
  rawConfigs: unknown,
): Promise<Result<BatchGenerationData>> {
  const validated = validateAndSanitizeBatchGenerationConfigs(rawConfigs);
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

    const outcome: GenerationOutcome = await executeGeneration({
      userId,
      action: "generate",
      songParams: {
        title: c.title || null,
        prompt: c.prompt,
        tags: c.style || null,
        isInstrumental: c.instrumental,
        batchId,
      },
      hasApiKey,
      mockFallback: mockSongs[i % mockSongs.length],
      guards: usingPersonalKey ? "personal-key" : "pre-authorized",
      description: `Batch generation ${i + 1}/${configs.length}: ${c.title || "Untitled"}`,
      apiCall: () =>
        Sentry.startSpan(
          {
            name: "suno.generateSong.batch",
            op: "http.client",
            attributes: { "batch.index": i, "batch.id": batchId },
          },
          () =>
            generateSong(
              c.prompt,
              {
                title: c.title,
                style: c.style,
                instrumental: c.instrumental,
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
