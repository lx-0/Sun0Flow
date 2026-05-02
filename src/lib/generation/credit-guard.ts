import {
  recordCreditUsage,
  shouldNotifyLowCredits,
  createLowCreditNotification,
  getMonthlyCreditUsage,
  CREDIT_COSTS,
} from "@/lib/credits";
import { insufficientCredits } from "@/lib/api-error";
import type { NextResponse } from "next/server";

export async function checkCreditBalance(
  userId: string,
  action: string,
  count = 1
): Promise<NextResponse | null> {
  const cost = (CREDIT_COSTS[action] ?? CREDIT_COSTS.generate) * count;
  const creditUsage = await getMonthlyCreditUsage(userId);
  if (creditUsage.creditsRemaining < cost) {
    return insufficientCredits(
      count > 1
        ? `Insufficient credits. You need ${cost} credits (${CREDIT_COSTS[action]} x ${count}) but only have ${creditUsage.creditsRemaining} remaining.`
        : `Insufficient credits. You need ${cost} credits but only have ${creditUsage.creditsRemaining} remaining.`
    );
  }
  return null;
}

export async function recordCreditsAndNotify(
  userId: string,
  action: string,
  opts: { songId: string; description: string }
): Promise<void> {
  const creditCost = CREDIT_COSTS[action] ?? CREDIT_COSTS.generate;
  await recordCreditUsage(userId, action, {
    songId: opts.songId,
    creditCost,
    description: opts.description,
  });

  try {
    const shouldNotify = await shouldNotifyLowCredits(userId);
    if (shouldNotify) {
      const usage = await getMonthlyCreditUsage(userId);
      await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
    }
  } catch {
    // Non-critical — don't block generation
  }
}
