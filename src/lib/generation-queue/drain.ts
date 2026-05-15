import { generateSong } from "@/lib/sunoapi";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { SUNOAPI_KEY } from "@/lib/env";
import { onCircuitClose } from "@/lib/circuit-breaker";
import { executeCore, type SongParams } from "@/lib/generation/core";
import { updateItem } from "./repository";

const DRAIN_BATCH_SIZE = 5;

export async function drainQueuedItems(): Promise<void> {
  if (!SUNOAPI_KEY) {
    logger.warn("generation: SUNOAPI_KEY not set — cannot drain queue");
    return;
  }

  const items = await prisma.generationQueueItem.findMany({
    where: { status: "pending" },
    orderBy: { position: "asc" },
    take: DRAIN_BATCH_SIZE,
  });

  if (items.length === 0) return;

  logger.info({ count: items.length }, "generation: draining queued items");

  for (const item of items) {
    await updateItem({ id: item.id }, { status: "processing" });

    const songParams: SongParams = {
      title: item.title ?? null,
      prompt: item.prompt,
      tags: item.tags ?? null,
      isInstrumental: item.makeInstrumental,
    };

    const outcome = await executeCore({
      userId: item.userId,
      action: "generate",
      songParams,
      apiCall: () =>
        generateSong(
          item.prompt,
          {
            title: item.title ?? undefined,
            style: item.tags ?? undefined,
            instrumental: item.makeInstrumental,
            personaId: item.personaId ?? undefined,
          },
          SUNOAPI_KEY
        ),
      description: `Song generation (queued): ${item.title || "Untitled"}`,
      creditRecording: true,
      coverArt: false,
    });

    switch (outcome.status) {
      case "created":
        await updateItem({ id: item.id }, { status: "done", songId: outcome.song.id });
        logger.info(
          { queueItemId: item.id, songId: outcome.song.id },
          "generation: queued item processed"
        );
        break;

      case "circuit_open":
        await updateItem({ id: item.id }, { status: "pending" });
        logger.warn(
          { queueItemId: item.id },
          "generation: circuit opened during drain — stopping"
        );
        return;

      case "api_error":
        logger.error(
          { queueItemId: item.id, err: outcome.rawError },
          "generation: queued item failed"
        );
        await updateItem({ id: item.id }, { status: "failed", errorMessage: outcome.errorMessage, songId: outcome.song.id }).catch(
          (updateErr) => {
            logger.error(
              { queueItemId: item.id, updateErr },
              "generation: failed to mark queued item as failed"
            );
          }
        );
        break;
    }
  }
}

onCircuitClose(() => {
  drainQueuedItems().catch((err) => {
    logger.error({ err }, "generation: queue drain failed after circuit close");
  });
});
