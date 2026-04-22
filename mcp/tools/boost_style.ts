/**
 * boost_style tool — expand a short style description into a detailed style prompt.
 * Returns the expanded style text synchronously.
 */

import { registerTool } from "../registry";
import { boostStyle, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { getMonthlyCreditUsage, recordCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { stripHtml } from "@/lib/sanitize";

registerTool({
  name: "boost_style",
  description:
    "Expand a short style/genre description into a detailed, rich style prompt. " +
    "E.g. 'chill lofi' → 'mellow lo-fi hip-hop with warm vinyl crackle, jazzy piano chords, and soft boom-bap drums'. " +
    "Use the result as the 'style' parameter in generate_song for more precise output. Costs 5 credits.",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "Short style or genre description to expand (e.g. 'chill lofi', 'epic cinematic', 'funky disco').",
        maxLength: 500,
      },
    },
    required: ["description"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { description } = input as { description: string };
    if (!description || typeof description !== "string" || !description.trim()) {
      throw new Error("description is required");
    }

    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
    if (!usingPersonalKey) {
      const usage = await getMonthlyCreditUsage(userId);
      if (usage.creditsRemaining < CREDIT_COSTS.style_boost) {
        throw new Error(
          `Insufficient credits: need ${CREDIT_COSTS.style_boost}, have ${usage.creditsRemaining}`
        );
      }
    }

    const cleanDescription = stripHtml(description).trim();

    try {
      const result = await boostStyle(cleanDescription, userApiKey);

      if (!usingPersonalKey) {
        await recordCreditUsage(userId, "style_boost", {
          creditCost: CREDIT_COSTS.style_boost,
          description: `MCP style boost: ${cleanDescription.slice(0, 50)}`,
        });
      }

      return {
        original: cleanDescription,
        boosted: result.result,
        creditsConsumed: result.creditsConsumed,
      };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Style boost failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
