import { acquireRateLimitSlot } from "@/lib/rate-limit";
import { resolveUserApiKey, generateSong, SunoApiError, getRemainingCredits, mockSongs } from "@/lib/sunoapi";
import { SUNOAPI_KEY } from "@/lib/env";
import { logServerError } from "@/lib/error-logger";
import { executeGeneration, userFriendlyError } from "@/lib/generation";
import { acquireNextItem, updateItem } from "./repository";
import type { ProcessNextResult } from "./types";

export async function processNextItem(userId: string): Promise<ProcessNextResult> {
  const acquireResult = await acquireNextItem(userId);
  if (acquireResult.status === "already_processing") {
    return { outcome: "already_processing", item: acquireResult.item };
  }
  if (acquireResult.status === "empty") {
    return { outcome: "empty" };
  }
  const nextItem = acquireResult.item;

  const { acquired, status: rateLimitStatus } = await acquireRateLimitSlot(userId);
  if (!acquired) {
    await updateItem({ id: nextItem.id }, { status: "pending" });
    return { outcome: "rate_limited", rateLimit: rateLimitStatus };
  }

  const userApiKey = await resolveUserApiKey(userId);
  const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

  const genOutcome = await executeGeneration({
    userId,
    action: "generate",
    songParams: {
      title: nextItem.title || null,
      prompt: nextItem.prompt,
      tags: nextItem.tags || null,
      isInstrumental: nextItem.makeInstrumental,
    },
    hasApiKey,
    mockFallback: mockSongs[0],
    guards: "pre-authorized",
    description: `Song generation (queued): ${nextItem.title || "Untitled"}`,
    apiCall: () =>
      generateSong(
        nextItem.prompt,
        {
          title: nextItem.title || undefined,
          style: nextItem.tags || undefined,
          instrumental: nextItem.makeInstrumental,
          personaId: nextItem.personaId || undefined,
        },
        userApiKey,
      ),
  });

  if (genOutcome.status === "denied") {
    await updateItem({ id: nextItem.id }, { status: "failed", errorMessage: "Generation denied" });
    return { outcome: "denied" };
  }

  if (genOutcome.status === "queued") {
    await updateItem({ id: nextItem.id }, { status: "pending", errorMessage: "Re-queued: circuit still open" });
    return { outcome: "queued", message: genOutcome.message };
  }

  if (genOutcome.status === "failed") {
    const correlationId = logServerError("queue-process", genOutcome.rawError, {
      userId,
      route: "/api/generation-queue/process-next",
      params: { queueItemId: nextItem.id },
    });
    const { code, details } = userFriendlyError(genOutcome.rawError);
    await updateItem({ id: nextItem.id }, { status: "failed", errorMessage: genOutcome.error, songId: genOutcome.song.id });

    let creditBalance: number | undefined;
    if (genOutcome.rawError instanceof SunoApiError && genOutcome.rawError.status === 402) {
      creditBalance = await getRemainingCredits().catch(() => undefined);
    }

    return {
      outcome: "failed",
      queueItem: nextItem,
      song: genOutcome.song,
      error: genOutcome.error,
      code,
      details,
      creditBalance,
      correlationId,
    };
  }

  const queueStatus = genOutcome.song.generationStatus === "ready" ? "done" as const : "processing" as const;
  if (queueStatus === "done") {
    await updateItem({ id: nextItem.id }, { status: "done", songId: genOutcome.song.id });
  } else {
    await updateItem({ id: nextItem.id }, { songId: genOutcome.song.id });
  }

  return {
    outcome: "created",
    queueItem: nextItem,
    song: genOutcome.song,
    queueStatus,
  };
}
