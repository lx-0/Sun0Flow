/**
 * Generation queue drain.
 *
 * Called automatically when the Suno API circuit breaker closes after a
 * successful probe request.  Processes up to BATCH_SIZE pending queue items
 * using the system API key so users don't need their personal key set for
 * queued requests to complete.
 */

import { prisma } from "@/lib/prisma";
import { generateSong } from "@/lib/sunoapi";
import { SUNOAPI_KEY } from "@/lib/env";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 5;

/** Drain pending GenerationQueueItems (up to BATCH_SIZE) now that Suno is back. */
export async function drainGenerationQueue(): Promise<void> {
  if (!SUNOAPI_KEY) {
    logger.warn("queue-processor: SUNOAPI_KEY not set — cannot drain queue");
    return;
  }

  const items = await prisma.generationQueueItem.findMany({
    where: { status: "pending" },
    orderBy: { position: "asc" },
    take: BATCH_SIZE,
  });

  if (items.length === 0) return;

  logger.info({ count: items.length }, "queue-processor: draining queued generation items");

  for (const item of items) {
    // Mark as processing to prevent double-processing.
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

      // Create a song record linked to this queue item.
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
        "queue-processor: item processed"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ queueItemId: item.id, err }, "queue-processor: item failed");
      try {
        await prisma.generationQueueItem.update({
          where: { id: item.id },
          data: { status: "failed", errorMessage: message },
        });
      } catch (updateErr) {
        logger.error(
          { queueItemId: item.id, updateErr },
          "queue-processor: failed to mark item as failed — item stuck in processing"
        );
      }
    }
  }
}
