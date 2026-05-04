import type {
  LyricsDetailResult,
  VocalSeparationDetailResult,
  WavConversionDetailResult,
  MusicVideoDetailResult,
  MidiDetailResult,
  CoverImageDetailResult,
} from "./types";
import { SunoApiError } from "./errors";
import { BASE_URL } from "./constants";
import { fetchWithRetry, buildHeaders } from "./fetch";

async function getDetail<T>(path: string, taskId: string, label: string, apiKey?: string): Promise<T> {
  const res = await fetchWithRetry(
    `${BASE_URL}/${path}/record-info?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET", headers: buildHeaders(apiKey) }
  );

  const json = (await res.json()) as { code?: number; msg?: string; data?: T };
  if (!json.data) {
    throw new SunoApiError(json.code ?? 500, json.msg ?? `No data in ${label} detail response`);
  }
  return json.data;
}

export function getLyricsDetail(taskId: string, apiKey?: string): Promise<LyricsDetailResult> {
  return getDetail<LyricsDetailResult>("lyrics", taskId, "lyrics", apiKey);
}

export function getVocalSeparationDetail(taskId: string, apiKey?: string): Promise<VocalSeparationDetailResult> {
  return getDetail<VocalSeparationDetailResult>("vocal-removal", taskId, "vocal separation", apiKey);
}

export function getWavConversionDetail(taskId: string, apiKey?: string): Promise<WavConversionDetailResult> {
  return getDetail<WavConversionDetailResult>("wav", taskId, "WAV conversion", apiKey);
}

export function getMusicVideoDetail(taskId: string, apiKey?: string): Promise<MusicVideoDetailResult> {
  return getDetail<MusicVideoDetailResult>("mp4", taskId, "music video", apiKey);
}

export function getMidiDetail(taskId: string, apiKey?: string): Promise<MidiDetailResult> {
  return getDetail<MidiDetailResult>("midi", taskId, "MIDI", apiKey);
}

export function getCoverImageDetail(taskId: string, apiKey?: string): Promise<CoverImageDetailResult> {
  return getDetail<CoverImageDetailResult>("suno/cover", taskId, "cover image", apiKey);
}
