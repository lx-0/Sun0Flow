import type {
  UploadCoverOptions,
  UploadExtendOptions,
  AddVocalsOptions,
  AddInstrumentalOptions,
  MashupOptions,
  ReplaceSectionOptions,
  GenerateResult,
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
  validateInfillRange,
} from "./validation";

export async function uploadAndCover(
  options: UploadCoverOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const customMode = options.customMode ?? false;
  const instrumental = options.instrumental ?? false;
  const model = options.model ?? DEFAULT_MODEL;

  if (customMode) {
    if (options.prompt != null) validatePrompt(options.prompt, model);
    if (options.style != null) validateStyle(options.style, model);
    if (options.title != null) validateTitle(options.title, model);
  } else if (options.prompt != null) {
    validateNonCustomPrompt(options.prompt);
  }
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    customMode,
    instrumental,
    model,
    callBackUrl: getCallbackUrl(),
  };

  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/upload-cover`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "upload-cover API");
  return { taskId };
}

export async function uploadAndExtend(
  options: UploadExtendOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const model = options.model ?? DEFAULT_MODEL;

  if (options.prompt != null) validatePrompt(options.prompt, model);
  if (options.style != null) validateStyle(options.style, model);
  if (options.title != null) validateTitle(options.title, model);
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    defaultParamFlag: options.defaultParamFlag ?? false,
    model,
    callBackUrl: getCallbackUrl(),
  };

  if (options.instrumental != null) body.instrumental = options.instrumental;
  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  if (options.continueAt != null) body.continueAt = options.continueAt;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/upload-extend`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "upload-extend API");
  return { taskId };
}

export async function addVocals(
  options: AddVocalsOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const model = options.model ?? DEFAULT_MODEL;

  validatePrompt(options.prompt, model);
  validateTitle(options.title, model);
  validateStyle(options.style, model);
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    prompt: options.prompt,
    title: options.title,
    style: options.style,
    callBackUrl: getCallbackUrl(),
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;
  if (options.vocalGender != null) body.vocalGender = options.vocalGender;
  if (options.styleWeight != null) body.styleWeight = options.styleWeight;
  if (options.weirdnessConstraint != null) body.weirdnessConstraint = options.weirdnessConstraint;
  if (options.audioWeight != null) body.audioWeight = options.audioWeight;
  if (options.model != null) body.model = options.model;

  const res = await fetchWithRetry(`${BASE_URL}/generate/add-vocals`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "add-vocals API");
  return { taskId };
}

export async function addInstrumental(
  options: AddInstrumentalOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const model = options.model ?? DEFAULT_MODEL;

  validateTitle(options.title, model);
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    uploadUrl: options.uploadUrl,
    title: options.title,
    tags: options.tags,
    callBackUrl: getCallbackUrl(),
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;
  if (options.vocalGender != null) body.vocalGender = options.vocalGender;
  if (options.styleWeight != null) body.styleWeight = options.styleWeight;
  if (options.audioWeight != null) body.audioWeight = options.audioWeight;
  if (options.weirdnessConstraint != null) body.weirdnessConstraint = options.weirdnessConstraint;
  if (options.model != null) body.model = options.model;

  const res = await fetchWithRetry(`${BASE_URL}/generate/add-instrumental`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "add-instrumental API");
  return { taskId };
}

export async function generateMashup(
  options: MashupOptions,
  apiKey?: string
): Promise<GenerateResult> {
  const customMode = options.customMode ?? false;
  const model = options.model ?? DEFAULT_MODEL;

  if (customMode) {
    if (options.prompt != null) validatePrompt(options.prompt, model);
    if (options.style != null) validateStyle(options.style, model);
    if (options.title != null) validateTitle(options.title, model);
  } else if (options.prompt != null) {
    validateNonCustomPrompt(options.prompt);
  }
  validateStyleTuningWeights(options);

  const body: Record<string, unknown> = {
    uploadUrlList: options.uploadUrlList,
    customMode,
    model,
    callBackUrl: getCallbackUrl(),
  };

  if (options.instrumental != null) body.instrumental = options.instrumental;
  if (options.prompt != null) body.prompt = options.prompt;
  if (options.style != null) body.style = options.style;
  if (options.title != null) body.title = options.title;
  applyStyleTuning(body, options);

  const res = await fetchWithRetry(`${BASE_URL}/generate/mashup`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "mashup API");
  return { taskId };
}

export async function replaceSection(
  options: ReplaceSectionOptions,
  apiKey?: string
): Promise<GenerateResult> {
  validateInfillRange(options.infillStartS, options.infillEndS);

  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    prompt: options.prompt,
    tags: options.tags,
    title: options.title,
    infillStartS: options.infillStartS,
    infillEndS: options.infillEndS,
    callBackUrl: getCallbackUrl(),
  };

  if (options.negativeTags != null) body.negativeTags = options.negativeTags;

  const res = await fetchWithRetry(`${BASE_URL}/generate/replace-section`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const taskId = await extractTaskId(res, "replace-section API");
  return { taskId };
}
