import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { CREDIT_COSTS } from "./constants";

export async function recordCreditUsage(
  userId: string,
  action: string,
  opts?: { songId?: string; creditCost?: number; description?: string }
) {
  const cost = opts?.creditCost ?? CREDIT_COSTS[action] ?? 0;
  const record = await prisma.creditUsage.create({
    data: {
      userId,
      action,
      creditCost: cost,
      songId: opts?.songId,
      description: opts?.description,
    },
  });
  logger.info(
    { userId, action, creditCost: cost, songId: opts?.songId ?? null },
    "credits: usage recorded"
  );
  return record;
}
