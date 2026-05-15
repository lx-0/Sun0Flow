import type { GenerationQueueItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AcquireResult,
  AddItemParams,
  AddItemResult,
  CancelResult,
  SongOutcome,
} from "./types";
import { MAX_QUEUE_SIZE } from "./types";

export async function listItems(userId: string): Promise<GenerationQueueItem[]> {
  return prisma.generationQueueItem.findMany({
    where: { userId, status: { in: ["pending", "processing"] } },
    orderBy: { position: "asc" },
  });
}

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

  await updateItem({ id: next.id }, { status: "processing" });

  return { status: "acquired", item: { ...next, status: "processing" } };
}

export function updateItem(
  where: { id: string } | { songId: string; status: string },
  data: Partial<Pick<GenerationQueueItem, "status" | "songId" | "errorMessage">>,
): Promise<unknown> {
  if ("id" in where) {
    return prisma.generationQueueItem.update({ where: { id: where.id }, data });
  }
  return prisma.generationQueueItem.updateMany({
    where: { songId: where.songId, status: where.status },
    data,
  });
}

export async function resolveBySongId(
  songId: string,
  outcome: SongOutcome,
): Promise<void> {
  if (outcome.status === "done") {
    await updateItem({ songId, status: "processing" }, { status: "done" });
  } else {
    await updateItem(
      { songId, status: "processing" },
      { status: "failed", errorMessage: outcome.errorMessage },
    );
  }
}
