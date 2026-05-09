import type {
  GenerateSongOptions,
  GenerateResult,
  ExtendMusicOptions,
} from "./types";
import { BASE_URL, getCallbackUrl, DEFAULT_MODEL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { extractTaskId, applyStyleTuning } from "./mappers";
import {
  validatePrompt,
  validateNonCustomPrompt,
  validateStyle,
  validateTitle,
  validateStyleTuningWeights,
} from "./validation";

export async function generateSong(
  prompt: string,
  options: GenerateSongOptions = {},
  apiKey?: string
): Promise<GenerateResult> {
  const instrumental = options.instrumental ?? false;
  const customMode = !!(options.title || options.style);
  const model = options.model ?? DEFAULT_MODEL;

  if (customMode) {
    validatePrompt(prompt, model);
    if (options.style) validateStyle(options.style, model);
    if (options.title) validateTitle(options.title, model);
  } else {
    validateNonCustomPrompt(prompt);
  }
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    prompt,
    instrumental,
    customMode,
    model,
    callBackUrl: getCallbackUrl(),
  };

  if (options.style) body.style = options.style;
  if (options.title) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "generate API");
  return { taskId };
}

export async function extendMusic(
  options: ExtendMusicOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const model = options.model ?? DEFAULT_MODEL;

  if (options.prompt != null) validatePrompt(options.prompt, model);
  if (options.style != null) validateStyle(options.style, model);
  if (options.title != null) validateTitle(options.title, model);
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    audioId: options.audioId,
    defaultParamFlag: options.defaultParamFlag ?? false,
    model,
    callBackUrl: getCallbackUrl(),
  };

  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  if (options.continueAt != null) body.continueAt = options.continueAt;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/extend`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "extend API");
  return { taskId };
}
