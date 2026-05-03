import { getSubscriptionBudget, getTopUpCreditsRemaining } from "./budget";
import { fetchMonthlyUsage } from "./usage";
import { analyzeUsage } from "./analyze";
import type { MonthlyCreditUsage } from "./analyze";

export async function getMonthlyCreditUsage(userId: string): Promise<MonthlyCreditUsage> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [subscriptionBudget, topUpCredits, raw] = await Promise.all([
    getSubscriptionBudget(userId),
    getTopUpCreditsRemaining(userId),
    fetchMonthlyUsage(userId, startOfMonth),
  ]);

  return analyzeUsage(subscriptionBudget, topUpCredits, raw, now);
}
