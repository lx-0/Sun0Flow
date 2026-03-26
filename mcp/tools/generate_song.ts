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
    "Submit a song generation request to SunoFlow. Returns immediately with the song ID and a 'pending' status. Poll get_song until generationStatus === 'ready'.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Style/genre prompt for the song (e.g. 'upbeat pop with electric guitar'). Required.",
        maxLength: 3000,
      },
      genre: {
        type: "string",
        description: "Optional genre tag (e.g. 'pop', 'jazz', 'metal').",
      },
      mood: {
        type: "string",
        description: "Optional mood tag (e.g. 'happy', 'melancholic', 'energetic').",
      },
      title: {
        type: "string",
        description: "Optional song title (max 200 chars).",
        maxLength: 200,
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { prompt, genre, mood, title } = input as {
      prompt: string;
      genre?: string;
      mood?: string;
      title?: string;
    };

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      throw new Error("prompt is required");
    }

    // Build style tags from genre + mood
    const tagParts = [genre, mood].filter(Boolean);
    const style = tagParts.length > 0 ? tagParts.join(", ") : undefined;

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
          generationStatus: "ready",
          audioUrl: "https://cdn1.suno.ai/mock.mp3",
        },
      });
      return { songId: song.id, generationStatus: song.generationStatus, title: song.title };
    }

    try {
      const result = await generateSong(
        cleanPrompt,
        { title: cleanTitle, style: cleanStyle },
        userApiKey
      );

      const song = await prisma.song.create({
        data: {
          userId,
          sunoJobId: result.taskId,
          title: cleanTitle ?? null,
          prompt: cleanPrompt,
          tags: cleanStyle ?? null,
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
        throw new Error(`Generation failed: ${err.message}`);
      }
      throw err;
    }
  },
});
