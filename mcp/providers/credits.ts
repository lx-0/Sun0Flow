/**
 * Resource provider: sunoflow://stats/credits
 * Returns current credit balance and monthly usage summary.
 */

import { registerStaticResource } from "../resources";
import { getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";

registerStaticResource({
  uri: "sunoflow://stats/credits",
  name: "Credit Stats",
  description:
    "Current credit balance, monthly usage, and cost reference for generation actions.",
  mimeType: "application/json",

  async fetch(userId: string) {
    const usage = await getMonthlyCreditUsage(userId);
    return {
      uri: "sunoflow://stats/credits",
      mimeType: "application/json",
      text: JSON.stringify(
        {
          creditsRemaining: usage.creditsRemaining,
          budget: usage.budget,
          creditsUsedThisMonth: usage.creditsUsedThisMonth,
          usagePercent: usage.usagePercent,
          isLow: usage.isLow,
          costs: CREDIT_COSTS,
        },
        null,
        2
      ),
    };
  },
});
