/**
 * generate_song tool — submit a song generation request.
 * Returns immediately with the song ID and pending status;
 * poll get_song until generationStatus === "ready".
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { generateSong, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { getMonthlyCreditUsage, recordCreditUsage, CREDIT_COSTS } from "@/lib/credits";
import { SUNOAPI_KEY } from "@/lib/env";
import { stripHtml } from "@/lib/sanitize";

registerTool({
  name: "generate_song",
  description:
    "Submit a song generation request to SunoFlow. Returns immediately with the song ID and a 'pending' status. Poll get_song until generationStatus === 'ready'. Generates 2 songs per request.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Song description or lyrics. In custom mode (when title or style is set), this is the lyrics text. Otherwise it is a free-form style/genre description (e.g. 'upbeat pop with electric guitar'). Max 3000 chars (V4) or 5000 chars (V4_5+). Non-custom mode: max 500 chars.",
        maxLength: 5000,
      },
      title: {
        type: "string",
        description: "Song title. Setting this enables custom mode. Max 80 chars (V4/V4_5ALL) or 100 chars (V4_5/V5/V5_5).",
        maxLength: 100,
      },
      style: {
        type: "string",
        description:
          "Comma-separated style/genre tags (e.g. 'pop, upbeat, summer'). Setting this enables custom mode.",
      },
      makeInstrumental: {
        type: "boolean",
        description: "If true, generate without vocals. Default false.",
      },
      model: {
        type: "string",
        enum: ["V4", "V4_5", "V5", "V5_5"],
        description:
          "Suno model version. V5_5 is latest with best quality. Default is V4 unless overridden by server config.",
      },
      personaId: {
        type: "string",
        description: "Voice persona ID to use for generation. Get IDs from your persona list.",
      },
      personaModel: {
        type: "string",
        enum: ["style_persona", "voice_persona"],
        description: "Type of persona to apply. 'voice_persona' clones vocal characteristics, 'style_persona' clones style.",
      },
      negativeTags: {
        type: "string",
        description:
          "Comma-separated tags to exclude from generation (e.g. 'autotune, screaming'). Tells the model what NOT to include.",
      },
      vocalGender: {
        type: "string",
        enum: ["m", "f"],
        description: "Preferred vocal gender: 'm' for male, 'f' for female.",
      },
      styleWeight: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Style guidance intensity (0.00–1.00). Higher values make the output follow the style tags more closely. Default ~0.5.",
      },
      weirdnessConstraint: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Creative deviation control (0.00–1.00). Higher values allow more experimental/unusual output. Default ~0.5.",
      },
      audioWeight: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Input audio influence weight (0.00–1.00). Only relevant when using persona or cover features.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const {
      prompt,
      title,
      style,
      makeInstrumental,
      model,
      personaId,
      personaModel,
      negativeTags,
      vocalGender,
      styleWeight,
      weirdnessConstraint,
      audioWeight,
    } = input as {
      prompt: string;
      title?: string;
      style?: string;
      makeInstrumental?: boolean;
      model?: string;
      personaId?: string;
      personaModel?: string;
      negativeTags?: string;
      vocalGender?: string;
      styleWeight?: number;
      weirdnessConstraint?: number;
      audioWeight?: number;
    };

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("prompt is required");
    }

    const cleanPrompt = stripHtml(prompt).trim();
    const cleanTitle = title ? stripHtml(title).trim() || undefined : undefined;
    const cleanStyle = style ? stripHtml(style).trim() || undefined : undefined;

    // Check credits
    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
    if (!usingPersonalKey) {
      const usage = await getMonthlyCreditUsage(userId);
      if (usage.creditsRemaining < CREDIT_COSTS.generate) {
        throw new Error(
          `Insufficient credits: need ${CREDIT_COSTS.generate}, have ${usage.creditsRemaining}`
        );
      }
    }

    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);

    if (!hasApiKey) {
      // Demo mode — return a mock pending song
      const song = await prisma.song.create({
        data: {
          userId,
          title: cleanTitle ?? null,
          prompt: cleanPrompt,
          tags: cleanStyle ?? null,
          isInstrumental: makeInstrumental ?? false,
          generationStatus: "ready",
          audioUrl: "https://cdn1.suno.ai/mock.mp3",
        },
      });
      return { songId: song.id, generationStatus: song.generationStatus, title: song.title };
    }

    try {
      const result = await generateSong(
        cleanPrompt,
        {
          title: cleanTitle,
          style: cleanStyle,
          instrumental: makeInstrumental,
          model: model as "V4" | "V4_5" | "V5" | "V5_5" | undefined,
          personaId,
          personaModel: personaModel as "style_persona" | "voice_persona" | undefined,
          negativeTags,
          vocalGender: vocalGender as "m" | "f" | undefined,
          styleWeight,
          weirdnessConstraint,
          audioWeight,
        },
        userApiKey
      );

      const song = await prisma.song.create({
        data: {
          userId,
          sunoJobId: result.taskId,
          title: cleanTitle ?? null,
          prompt: cleanPrompt,
          tags: cleanStyle ?? null,
          isInstrumental: makeInstrumental ?? false,
          generationStatus: "pending",
        },
      });

      if (!usingPersonalKey) {
        await recordCreditUsage(userId, "generate", {
          songId: song.id,
          creditCost: CREDIT_COSTS.generate,
          description: `MCP song generation: ${cleanTitle ?? "Untitled"}`,
        });
      }

      return { songId: song.id, generationStatus: song.generationStatus, title: song.title };
    } catch (err) {
      if (err instanceof SunoApiError) {
        throw new Error(`Generation failed (${err.code}): ${err.message}`);
      }
      throw err;
    }
  },
});
