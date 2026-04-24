/**
 * create_music_video tool — generate an MP4 music video with synchronized visuals.
 */

import { registerTool } from "../registry";
import { prisma } from "@/lib/prisma";
import { createMusicVideo, SunoApiError } from "@/lib/sunoapi";
import { resolveUserApiKeyWithMode } from "@/lib/sunoapi/resolve-key";

registerTool({
  name: "create_music_video",
  description:
    "Create an MP4 music video with synchronized visual effects for a generated song. " +
    "Videos are retained for 15 days. Returns a taskId for polling.",
  inputSchema: {
    type: "object",
    properties: {
      songId: {
        type: "string",
        description: "The song ID to create a music video for.",
      },
      author: {
        type: "string",
        description: "Optional author/artist name to display in the video.",
      },
    },
    required: ["songId"],
    additionalProperties: false,
  },

  async handler(input: unknown, userId: string) {
    const { songId, author } = input as { songId: string; author?: string };

    if (!songId) throw new Error("songId is required");

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { sunoJobId: true, sunoAudioId: true, generationStatus: true },
    });
    if (!song) throw new Error(`Song not found: ${songId}`);
    if (!song.sunoJobId || !song.sunoAudioId) throw new Error("Cannot create video — song is missing Suno identifiers.");
    if (song.generationStatus !== "ready") throw new Error("Song must be fully generated before creating a video.");

    const { apiKey: userApiKey } = await resolveUserApiKeyWithMode(userId);

    try {
      const result = await createMusicVideo(
        { taskId: song.sunoJobId, audioId: song.sunoAudioId, author },
        userApiKey
      );
      return { taskId: result.taskId, status: "pending" };
    } catch (err) {
      if (err instanceof SunoApiError) throw new Error(`Music video creation failed (${err.code}): ${err.message}`);
      throw err;
    }
  },
});
