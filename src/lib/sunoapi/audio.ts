import type {
  SeparateVocalsOptions,
  ConvertToWavOptions,
  GenerateMidiOptions,
  MusicVideoOptions,
  GenerateResult,
} from "./types";
import { BASE_URL, getCallbackUrl } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { extractTaskId } from "./mappers";
import { validateAuthor, validateDomainName } from "./validation";

/**
 * Separate vocals and instruments from a track.
 * type="separate_vocal" returns vocal + instrumental (10 credits).
 * type="split_stem" returns full stem separation (50 credits).
 */
export async function separateVocals(
  options: SeparateVocalsOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body = {
    taskId: options.taskId,
    audioId: options.audioId,
    type: options.type,
    callBackUrl: getCallbackUrl(),
  };

  const res = await fetchWithRetry(`${BASE_URL}/vocal-removal/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "vocal-removal API");
  return { taskId };
}

/**
 * Convert a generated track to WAV format.
 */
export async function convertToWav(
  options: ConvertToWavOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body = {
    taskId: options.taskId,
    audioId: options.audioId,
    callBackUrl: getCallbackUrl(),
  };

  const res = await fetchWithRetry(`${BASE_URL}/wav/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "wav/generate API");
  return { taskId };
}

/**
 * Generate a MIDI file from a previously separated vocal track.
 * Requires a completed vocal separation task.
 */
export async function generateMidi(
  options: GenerateMidiOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const body: Record<string, unknown> = {
    taskId: options.taskId,
    callBackUrl: getCallbackUrl(),
  };
  if (options.audioId != null) body.audioId = options.audioId;

  const res = await fetchWithRetry(`${BASE_URL}/midi/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "midi/generate API");
  return { taskId };
}

/**
 * Create an MP4 music video with synchronized visual effects.
 * Videos are retained for 15 days.
 */
export async function createMusicVideo(
  options: MusicVideoOptions,
  apiKey?: string
): Promise<GenerateResult> {
  if (options.author != null) validateAuthor(options.author);
  if (options.domainName != null) validateDomainName(options.domainName);

  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    callBackUrl: getCallbackUrl(),
  };

  if (options.author != null) body.author = options.author;
  if (options.domainName != null) body.domainName = options.domainName;

  const res = await fetchWithRetry(`${BASE_URL}/mp4/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "mp4/generate API");
  return { taskId };
}
