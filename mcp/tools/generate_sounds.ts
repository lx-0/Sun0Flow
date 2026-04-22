/**
 * generate_sounds tool — generate ambient sounds/SFX from a text prompt.
 */

import { registerTool } from "../registry";
import { generateSounds, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { getMonthlyCreditUsage, recordCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { stripHtml } from "@/lib/sanitize";

registerTool({
  name: "generate_sounds",
  description:
    "Generate ambient sounds or sound effects from a text prompt. " +
    "Supports looping, tempo (BPM), and musical key control. Uses V5 model only. " +
    "Returns a taskId — poll get_song until ready.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Description of the sound to generate (e.g. 'rain on a tin roof', 'lo-fi vinyl crackle', '808 drum loop'). Max 500 chars.",
        maxLength: 500,
      },
      soundLoop: {
        type: "boolean",
        description: "Enable looped playback — useful for ambient audio or beat loops. Default false.",
      },
      soundTempo: {
        type: "number",
        minimum: 1,
        maximum: 300,
        description: "BPM tempo for rhythmic sounds (1–300). Only meaningful for beat/rhythm sounds.",
      },
      soundKey: {
        type: "string",
        enum: [
          "Any", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
          "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
        ],
        description: "Musical key for the sound. 'Any' lets the model choose. Minor keys end with 'm'.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { prompt, soundLoop, soundTempo, soundKey } = input as {
      prompt: string;
      soundLoop?: boolean;
      soundTempo?: number;
      soundKey?: string;
    };

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("prompt is required");
    }

    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
    if (!usingPersonalKey) {
      const usage = await getMonthlyCreditUsage(userId);
      if (usage.creditsRemaining < CREDIT_COSTS.generate) {
        throw new Error(
          `Insufficient credits: need ${CREDIT_COSTS.generate}, have ${usage.creditsRemaining}`
        );
      }
    }

    const cleanPrompt = stripHtml(prompt).trim();

    try {
      const result = await generateSounds(
        {
          prompt: cleanPrompt,
          soundLoop,
          soundTempo,
          soundKey: soundKey as import("@/lib/sunoapi").SoundKey | undefined,
        },
        userApiKey
      );

      if (!usingPersonalKey) {
        await recordCreditUsage(userId, "generate", {
          creditCost: CREDIT_COSTS.generate,
          description: `MCP sounds generation: ${cleanPrompt.slice(0, 50)}`,
        });
      }

      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Sound generation failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
