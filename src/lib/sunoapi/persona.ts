import type { GeneratePersonaOptions, PersonaResult, BoostStyleResult } from "./types";
import { SunoApiError } from "./errors";
import { BASE_URL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";
import { validatePersonaVocalSegment } from "./validation";

/**
 * Create a reusable persona from an existing audio track.
 * Vocal segment must be 10–30 seconds.
 */
export async function generatePersona(
  options: GeneratePersonaOptions,
  apiKey?: string
): Promise<PersonaResult> {
  const vocalStart = options.vocalStart ?? 0;
  const vocalEnd = options.vocalEnd ?? 30;
  validatePersonaVocalSegment(vocalStart, vocalEnd);

  const body: Record<string, unknown> = {
    taskId: options.taskId,
    audioId: options.audioId,
    name: options.name,
    description: options.description,
  };

  if (options.vocalStart != null) body.vocalStart = options.vocalStart;
  if (options.vocalEnd != null) body.vocalEnd = options.vocalEnd;
  if (options.style != null) body.style = options.style;

  const res = await fetchWithRetry(`${BASE_URL}/generate/generate-persona`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: PersonaResult;
  };

  if (!json.data?.personaId) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No persona data returned");
  }

  return json.data;
}

/**
 * Boost/expand a style description into a detailed style prompt.
 * V4.5+ feature. Returns the expanded style text synchronously.
 */
export async function boostStyle(
  content: string,
  apiKey?: string
): Promise<BoostStyleResult> {
  const res = await fetchWithRetry(`${BASE_URL}/style/generate`, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ content }),
  });

  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: BoostStyleResult;
  };

  if (!json.data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? "No data from style/generate API");
  }

  return json.data;
}
