import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { convertToWav, resolveUserApiKey } from "@/lib/sunoapi";
import { executeTransform, respondToTransform } from "@/lib/generation";
import { validateSongTransformPrerequisites } from "@/lib/song-transform-guards";

export const POST = authRoute<{ id: string }>(
  async (_request, { auth, params }) => {
    const { data: song, error } = requireOwned(
      await prisma.song.findUnique({ where: { id: params.id } }),
      auth.userId,
      "Song",
    );
    if (error) return error;

    const userApiKey = await resolveUserApiKey(auth.userId);
    const hasApiKey = !!(userApiKey || process.env.SUNOAPI_KEY);
    const validationError = validateSongTransformPrerequisites(song, {
      requireIdentifiers: hasApiKey,
      notReadyMessage: "Song must be fully generated before converting to WAV.",
      missingIdentifiersMessage: "Song is missing Suno identifiers for WAV conversion.",
    });
    if (validationError) return validationError;

    const outcome = await executeTransform({
      userId: auth.userId,
      action: "generate",
      apiCall: () => convertToWav(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId! },
        userApiKey,
      ),
      hasApiKey,
      mockTaskId: `mock-wav-${params.id}`,
      fallbackErrorMessage: "WAV conversion failed. Please try again.",
    });

    return respondToTransform(
      outcome,
      { label: "convert-wav-api", userId: auth.userId, route: `/api/songs/${params.id}/convert-wav` },
      { songId: params.id, format: "wav" },
    );
  },
  { route: "/api/songs/[id]/convert-wav" },
);
