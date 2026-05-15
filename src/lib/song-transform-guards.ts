import { badRequest } from "@/lib/api-error";

type TransformableSong = {
  generationStatus: string;
  sunoJobId: string | null;
  sunoAudioId: string | null;
};

type ValidateSongTransformOptions = {
  requireIdentifiers: boolean;
  notReadyMessage: string;
  missingIdentifiersMessage: string;
};

export function validateSongTransformPrerequisites(
  song: TransformableSong,
  options: ValidateSongTransformOptions,
): Response | null {
  if (song.generationStatus !== "ready") {
    return badRequest(options.notReadyMessage);
  }

  if (options.requireIdentifiers && (!song.sunoJobId || !song.sunoAudioId)) {
    return badRequest(options.missingIdentifiersMessage);
  }

  return null;
}
