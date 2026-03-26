/**
 * get_credits tool — check remaining generation credits.
 */

import { registerTool } from "../registry";
import { getMonthlyCreditUsage, CREDIT_COSTS } from "@/lib/credits";

registerTool({
  name: "get_credits",
  description:
    "Check the user's remaining generation credits for this month. Each song generation costs 10 credits.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },

  async handler(_input: unknown, userId: string) {
    const usage = await getMonthlyCreditUsage(userId);
    return {
      creditsRemaining: usage.creditsRemaining,
      budget: usage.budget,
      creditsUsedThisMonth: usage.creditsUsedThisMonth,
      usagePercent: usage.usagePercent,
      costPerGeneration: CREDIT_COSTS.generate,
    };
  },
});
