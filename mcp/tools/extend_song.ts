/**
 * extend_song tool — extend/continue an existing song.
 * Returns a taskId for polling via get_song.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { extendMusic, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";
import { checkCredits, deductCredits } from "@/lib/credits";
import { SUNOAPI_KEY } from "@/lib/env";
import { stripHtml } from "@/lib/sanitize";

registerTool({
  name: "extend_song",
  description:
    "Extend/continue an existing song from a specific point. Creates a new variation linked to the original. Returns a song ID — poll get_song until generationStatus === 'ready'.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The ID of the song to extend (from list_songs or get_song).",
      },
      prompt: {
        type: "string",
        description:
          "Optional lyrics or description for the extension. If omitted, continues in the original style. Max 3000 chars (V4) or 5000 chars (V4_5+).",
        maxLength: 5000,
      },
      style: {
        type: "string",
        description: "Optional style/genre tags for the extension (e.g. 'epic guitar solo, rock'). Max 200 chars (V4) or 1000 chars (V4_5+).",
      },
      title: {
        type: "string",
        description: "Optional title for the extended version. Max 80 chars (V4/V4_5ALL) or 100 chars (V4_5/V5/V5_5).",
        maxLength: 100,
      },
      continueAt: {
        type: "number",
        description:
          "Start point in seconds from which to continue the song. If omitted, continues from the end.",
        minimum: 0,
      },
      model: {
        type: "string",
        enum: ["V4", "V4_5", "V5", "V5_5"],
        description: "Suno model version. Should match the original song's model for best results.",
      },
      negativeTags: {
        type: "string",
        description: "Comma-separated tags to exclude from the extension.",
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
        description: "Style guidance intensity (0.00–1.00).",
      },
      weirdnessConstraint: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Creative deviation control (0.00–1.00).",
      },
    },
    required: ["songId"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const {
      songId,
      prompt,
      style,
      title,
      continueAt,
      model,
      negativeTags,
      vocalGender,
      styleWeight,
      weirdnessConstraint,
    } = input as {
      songId: string;
      prompt?: string;
      style?: string;
      title?: string;
      continueAt?: number;
      model?: string;
      negativeTags?: string;
      vocalGender?: string;
      styleWeight?: number;
      weirdnessConstraint?: number;
    };

    if (!songId) throw new Error("songId is required");

    const parentSong = await prisma.song.findFirst({
      where: { id: songId, userId },
    });
    if (!parentSong) throw new Error(`Song not found: ${songId}`);
    if (!parentSong.sunoAudioId) throw new Error("Cannot extend a song without a Suno audio ID.");

    // Check credits
    const { apiKey: userApiKey, usingPersonalKey } = await resolveUserApiKeyWithMode(userId);
    if (!usingPersonalKey) {
      const check = await checkCredits(userId, "extend");
      if (!check.ok) {
        throw new Error(
          `Insufficient credits: need ${check.creditCost}, have ${check.creditsRemaining}`
        );
      }
    }

    const hasApiKey = !!(userApiKey || SUNOAPI_KEY);
    if (!hasApiKey) throw new Error("No API key configured. Set up a Suno API key in settings.");

    const cleanPrompt = prompt ? stripHtml(prompt).trim() || undefined : undefined;
    const cleanStyle = style ? stripHtml(style).trim() || undefined : undefined;
    const cleanTitle = title ? stripHtml(title).trim() || undefined : undefined;
    const hasCustomParams = !!(cleanPrompt || cleanStyle || cleanTitle || continueAt != null);

    try {
      const result = await extendMusic(
        {
          audioId: parentSong.sunoAudioId,
          defaultParamFlag: hasCustomParams,
          prompt: cleanPrompt,
          style: cleanStyle,
          title: cleanTitle,
          continueAt,
          model: model as "V4" | "V4_5" | "V5" | "V5_5" | undefined,
          negativeTags,
          vocalGender: vocalGender as "m" | "f" | undefined,
          styleWeight,
          weirdnessConstraint,
        },
        userApiKey
      );

      const rootId = parentSong.parentSongId ?? songId;

      const song = await prisma.song.create({
        data: {
          userId,
          parentSongId: rootId,
          sunoJobId: result.taskId,
          title: cleanTitle ?? parentSong.title ? `${parentSong.title} (extended)` : null,
          prompt: cleanPrompt ?? parentSong.prompt ?? "",
          tags: cleanStyle ?? parentSong.tags ?? null,
          isInstrumental: parentSong.isInstrumental,
          generationStatus: "pending",
        },
      });

      if (!usingPersonalKey) {
        await deductCredits(userId, "extend", {
          songId: song.id,
          description: `MCP song extension: ${cleanTitle ?? parentSong.title ?? "Untitled"}`,
        });
      }

      return { songId: song.id, generationStatus: "pending", parentSongId: rootId };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Extension failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
