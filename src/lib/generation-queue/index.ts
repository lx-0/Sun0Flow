import type { GenerationQueueItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateSong } from "@/lib/sunoapi";
import { SUNOAPI_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";

export const MAX_QUEUE_SIZE = 10;
const DRAIN_BATCH_SIZE = 5;

// ── Types ───────────────────────────────────────────────────────────────

export interface AddItemParams {
  prompt: string;
  title?: string | null;
  tags?: string | null;
  makeInstrumental?: boolean;
  personaId?: string | null;
}

export type AddItemResult =
  | { ok: true; item: GenerationQueueItem }
  | { ok: false; code: "QUEUE_FULL"; message: string };

export type CancelResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" };

// ── Queries ─────────────────────────────────────────────────────────────

export async function listItems(userId: string): Promise<GenerationQueueItem[]> {
  return prisma.generationQueueItem.findMany({
    where: { userId, status: { in: ["pending", "processing"] } },
    orderBy: { position: "asc" },
  });
}

// ── Mutations ───────────────────────────────────────────────────────────

export async function addItem(
  userId: string,
  params: AddItemParams
): Promise<AddItemResult> {
  const pendingCount = await prisma.generationQueueItem.count({
    where: { userId, status: { in: ["pending", "processing"] } },
  });

  if (pendingCount >= MAX_QUEUE_SIZE) {
    return { ok: false, code: "QUEUE_FULL", message: `Queue is full (max ${MAX_QUEUE_SIZE} items)` };
  }

  const lastItem = await prisma.generationQueueItem.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (lastItem?.position ?? -1) + 1;

  const item = await prisma.generationQueueItem.create({
    data: {
      userId,
      prompt: params.prompt.trim(),
      title: params.title?.trim() || null,
      tags: params.tags?.trim() || null,
      makeInstrumental: Boolean(params.makeInstrumental),
      personaId: params.personaId || null,
      position,
    },
  });

  return { ok: true, item };
}

export async function enqueueFromSpec(
  userId: string,
  params: { prompt: string; title: string | null; tags: string | null; isInstrumental: boolean; personaId?: string | null }
): Promise<void> {
  const maxPos = await prisma.generationQueueItem.aggregate({
    _max: { position: true },
    where: { userId, status: "pending" },
  });
  const position = (maxPos._max.position ?? 0) + 1;

  await prisma.generationQueueItem.create({
    data: {
      userId,
      prompt: params.prompt,
      title: params.title ?? null,
      tags: params.tags ?? null,
      makeInstrumental: params.isInstrumental,
      personaId: params.personaId ?? null,
      status: "pending",
      position,
    },
  });
}

export async function cancelItem(userId: string, itemId: string): Promise<CancelResult> {
  const item = await prisma.generationQueueItem.findFirst({
    where: { id: itemId, userId },
  });

  if (!item) return { ok: false, code: "NOT_FOUND" };

  if (item.status === "processing") {
    await prisma.generationQueueItem.update({
      where: { id: itemId },
      data: { status: "cancelled" },
    });
  } else {
    await prisma.generationQueueItem.delete({ where: { id: itemId } });
  }

  return { ok: true };
}

export async function reorderItems(userId: string, orderedIds: string[]): Promise<void> {
  const items = await prisma.generationQueueItem.findMany({
    where: { userId, status: "pending", id: { in: orderedIds } },
    select: { id: true },
  });

  const validIds = new Set(items.map((i) => i.id));
  const filteredIds = orderedIds.filter((id) => validIds.has(id));

  await prisma.$transaction(
    filteredIds.map((id, index) =>
      prisma.generationQueueItem.update({
        where: { id },
        data: { position: index },
      })
    )
  );
}

// ── Processing state machine ────────────────────────────────────────────

export type AcquireResult =
  | { status: "acquired"; item: GenerationQueueItem }
  | { status: "already_processing"; item: GenerationQueueItem }
  | { status: "empty" };

export async function acquireNextItem(userId: string): Promise<AcquireResult> {
  const processing = await prisma.generationQueueItem.findFirst({
    where: { userId, status: "processing" },
  });
  if (processing) return { status: "already_processing", item: processing };

  const next = await prisma.generationQueueItem.findFirst({
    where: { userId, status: "pending" },
    orderBy: { position: "asc" },
  });
  if (!next) return { status: "empty" };

  await prisma.generationQueueItem.update({
    where: { id: next.id },
    data: { status: "processing" },
  });

  return { status: "acquired", item: { ...next, status: "processing" } };
}

export async function markProcessing(itemId: string): Promise<void> {
  await prisma.generationQueueItem.update({
    where: { id: itemId },
    data: { status: "processing" },
  });
}

export async function markDone(itemId: string, songId: string): Promise<void> {
  await prisma.generationQueueItem.update({
    where: { id: itemId },
    data: { status: "done", songId },
  });
}

export async function linkSong(itemId: string, songId: string): Promise<void> {
  await prisma.generationQueueItem.update({
    where: { id: itemId },
    data: { songId },
  });
}

export async function markFailed(
  itemId: string,
  errorMessage: string,
  songId?: string
): Promise<void> {
  await prisma.generationQueueItem.update({
    where: { id: itemId },
    data: { status: "failed", errorMessage, ...(songId && { songId }) },
  });
}

export async function markPending(
  itemId: string,
  errorMessage?: string
): Promise<void> {
  await prisma.generationQueueItem.update({
    where: { id: itemId },
    data: { status: "pending", ...(errorMessage && { errorMessage }) },
  });
}

export async function markDoneBySongId(songId: string): Promise<void> {
  await prisma.generationQueueItem.updateMany({
    where: { songId, status: "processing" },
    data: { status: "done" },
  });
}

export async function markFailedBySongId(
  songId: string,
  errorMessage: string
): Promise<void> {
  await prisma.generationQueueItem.updateMany({
    where: { songId, status: "processing" },
    data: { status: "failed", errorMessage },
  });
}

// ── Drain ───────────────────────────────────────────────────────────────

export async function drainQueue(): Promise<void> {
  if (!SUNOAPI_KEY) {
    logger.warn("generation-queue: SUNOAPI_KEY not set — cannot drain queue");
    return;
  }

  const items = await prisma.generationQueueItem.findMany({
    where: { status: "pending" },
    orderBy: { position: "asc" },
    take: DRAIN_BATCH_SIZE,
  });

  if (items.length === 0) return;

  logger.info({ count: items.length }, "generation-queue: draining queued items");

  for (const item of items) {
    await prisma.generationQueueItem.update({
      where: { id: item.id },
      data: { status: "processing" },
    });

    try {
      const result = await generateSong(
        item.prompt,
        {
          title: item.title ?? undefined,
          style: item.tags ?? undefined,
          instrumental: item.makeInstrumental,
          personaId: item.personaId ?? undefined,
        },
        SUNOAPI_KEY
      );

      const song = await prisma.song.create({
        data: {
          userId: item.userId,
          sunoJobId: result.taskId,
          title: item.title ?? null,
          prompt: item.prompt,
          tags: item.tags ?? null,
          isInstrumental: item.makeInstrumental,
          generationStatus: "pending",
        },
      });

      await prisma.generationQueueItem.update({
        where: { id: item.id },
        data: { status: "done", songId: song.id },
      });

      logger.info(
        { queueItemId: item.id, songId: song.id, taskId: result.taskId },
        "generation-queue: item processed"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ queueItemId: item.id, err }, "generation-queue: item failed");
      try {
        await prisma.generationQueueItem.update({
          where: { id: item.id },
          data: { status: "failed", errorMessage: message },
        });
      } catch (updateErr) {
        logger.error(
          { queueItemId: item.id, updateErr },
          "generation-queue: failed to mark item as failed — stuck in processing"
        );
      }
    }
  }
}
