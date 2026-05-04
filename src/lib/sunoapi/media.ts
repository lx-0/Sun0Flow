import type {
  GenerateSoundsOptions,
  GenerateCoverImageOptions,
  CoverImageResult,
  GenerateResult,
} from "./types";
import { BASE_URL, getCallbackUrl } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { extractTaskId } from "./mappers";
import { validateSoundsPrompt, validateSoundTempo } from "./validation";

export async function generateSounds(
  options: GenerateSoundsOptions,
  apiKey?: string
): Promise<GenerateResult> {
  validateSoundsPrompt(options.prompt);
  if (options.soundTempo != null) validateSoundTempo(options.soundTempo);

  const body: Record<string, unknown> = {
    prompt: options.prompt,
    model: options.model ?? "V5",
    callBackUrl: getCallbackUrl(),
  };

  if (options.soundLoop != null) body.soundLoop = options.soundLoop;
  if (options.soundTempo != null) body.soundTempo = options.soundTempo;
  if (options.soundKey != null) body.soundKey = options.soundKey;
  if (options.grabLyrics != null) body.grabLyrics = options.grabLyrics;

  const res = await fetchWithRetry(`${BASE_URL}/generate/sounds`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "generate/sounds API");
  return { taskId };
}

export async function generateCoverImage(
  options: GenerateCoverImageOptions,
  apiKey?: string
): Promise<CoverImageResult> {
  const body = {
    taskId: options.taskId,
    callBackUrl: getCallbackUrl(),
  };

  const res = await fetchWithRetry(`${BASE_URL}/suno/cover/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "suno/cover/generate API");
  return { taskId };
}
