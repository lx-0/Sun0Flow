import { CREDIT_COSTS } from "./constants";
import { getMonthlyCreditUsage } from "./status";
import { recordCreditUsage } from "./usage";
import { shouldNotifyLowCredits, createLowCreditNotification } from "./notifications";

export type CreditCheckResult =
  | { ok: true; creditCost: number; creditsRemaining: number }
  | { ok: false; creditCost: number; creditsRemaining: number };

export function getCreditCost(action: string): number {
  return CREDIT_COSTS[action] ?? CREDIT_COSTS.generate;
}

export async function checkCredits(
  userId: string,
  action: string
): Promise<CreditCheckResult> {
  const creditCost = getCreditCost(action);
  const usage = await getMonthlyCreditUsage(userId);
  return {
    ok: usage.creditsRemaining >= creditCost,
    creditCost,
    creditsRemaining: usage.creditsRemaining,
  };
}

export async function deductCredits(
  userId: string,
  action: string,
  opts?: { songId?: string; description?: string }
): Promise<void> {
  const creditCost = getCreditCost(action);
  await recordCreditUsage(userId, action, {
    creditCost,
    songId: opts?.songId,
    description: opts?.description,
  });

  try {
    const usage = await getMonthlyCreditUsage(userId);
    if (await shouldNotifyLowCredits(userId, usage)) {
      await createLowCreditNotification(userId, usage.creditsRemaining, usage.budget);
    }
  } catch {
    // Non-critical — don't block the caller
  }
}
