import { authRoute, requireOwned } from "@/lib/route-handler";
import { prisma } from "@/lib/prisma";
import { generateMidi, resolveUserApiKey } from "@/lib/sunoapi";
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
      notReadyMessage: "Song must be fully generated before extracting MIDI.",
      missingIdentifiersMessage: "Song is missing Suno identifiers for MIDI extraction.",
    });
    if (validationError) return validationError;

    const outcome = await executeTransform({
      userId: auth.userId,
      action: "generate",
      apiCall: () => generateMidi(
        { taskId: song.sunoJobId!, audioId: song.sunoAudioId! },
        userApiKey,
      ),
      hasApiKey,
      mockTaskId: `mock-midi-${params.id}`,
      fallbackErrorMessage: "MIDI generation failed. Please try again.",
    });

    return respondToTransform(
      outcome,
      { label: "generate-midi-api", userId: auth.userId, route: `/api/songs/${params.id}/generate-midi` },
      { songId: params.id, format: "midi" },
    );
  },
  { route: "/api/songs/[id]/generate-midi" },
);
