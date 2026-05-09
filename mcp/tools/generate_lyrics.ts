/**
 * generate_lyrics tool — generate song lyrics from a text description.
 * Returns a taskId — poll with get_lyrics_status until complete.
 */

import { registerTool } from "../registry";
import { generateLyrics, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { checkCredits, deductCredits } from "@/lib/credits";
import { stripHtml } from "@/lib/sanitize";

registerTool({
  name: "generate_lyrics",
  description:
    "Generate song lyrics from a text description. Returns a taskId — poll get_lyrics_status until the lyrics are ready. Costs 2 credits.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Description of the lyrics to generate (max 200 chars). E.g. 'a love song about meeting someone at a coffee shop'.",
        maxLength: 200,
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { prompt } = input as { prompt: string };
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("prompt is required");
    }

    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
    if (!usingPersonalKey) {
      const check = await checkCredits(userId, "lyrics");
      if (!check.ok) {
        throw new Error(
          `Insufficient credits: need ${check.creditCost}, have ${check.creditsRemaining}`
        );
      }
    }

    const cleanPrompt = stripHtml(prompt).trim();

    try {
      const result = await generateLyrics({ prompt: cleanPrompt }, userApiKey);

      if (!usingPersonalKey) {
        await deductCredits(userId, "lyrics", {
          description: `MCP lyrics generation: ${cleanPrompt.slice(0, 50)}`,
        });
      }

      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Lyrics generation failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
