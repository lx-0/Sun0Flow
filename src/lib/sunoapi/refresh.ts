import { BASE_URL } from "./constants";
import { buildHeaders } from "./fetch";
import { logger } from "@/lib/logger";

function extractUrls(raw: Record<string, unknown>): { audioUrl?: string; imageUrl?: string } | null {
  // Prefer sourceAudioUrl (cdn1.suno.ai, permanent) over audioUrl (tempfile CDN, expires)
  const audioUrl =
    (raw.sourceAudioUrl as string) ||
    (raw.source_audio_url as string) ||
    (raw.audio_url as string) ||
    (raw.audioUrl as string);
  if (!audioUrl) return null;
  const imageUrl = (raw.image_url as string) || (raw.imageUrl as string) || undefined;
  return { audioUrl, imageUrl };
}

/**
 * Fetch fresh audio/image URLs from sunoapi.org, bypassing the circuit
 * breaker. Tries two strategies:
 *  1. GET /generate/record-info?taskId=  (task-level lookup)
 *  2. GET /songs/{sunoAudioId}           (song-level lookup — may have fresher CDN URLs)
 */
export async function fetchFreshUrls(
  taskId: string,
  apiKey?: string,
  sunoAudioId?: string
): Promise<{ audioUrl?: string; imageUrl?: string } | null> {
  // Strategy 1: record-info by taskId
  try {
    const res = await fetch(
      `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { method: "GET", headers: buildHeaders(apiKey) }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { response?: { sunoData?: Record<string, unknown>[] } };
      };
      const clips = json.data?.response?.sunoData ?? [];
      const match = clips.find((c) => {
        const url = (c.sourceAudioUrl as string) || (c.source_audio_url as string) || (c.audio_url as string) || (c.audioUrl as string);
        return typeof url === "string" && url;
      });
      if (match) {
        const urls = extractUrls(match);
        if (urls) return urls;
      }
    } else {
      logger.warn({ taskId, status: res.status }, "fetchFreshUrls: record-info returned non-OK");
    }
  } catch (err) {
    logger.warn({ taskId, err }, "fetchFreshUrls: record-info threw");
  }

  // Strategy 2: fetch by sunoAudioId (may return fresher CDN URLs)
  if (sunoAudioId) {
    try {
      const res = await fetch(
        `${BASE_URL}/songs/${encodeURIComponent(sunoAudioId)}`,
        { method: "GET", headers: buildHeaders(apiKey) }
      );
      if (res.ok) {
        const json = (await res.json()) as { clip?: Record<string, unknown>; data?: Record<string, unknown> };
        const raw = json.clip ?? json.data;
        if (raw) {
          const urls = extractUrls(raw);
          if (urls) {
            logger.info({ sunoAudioId }, "fetchFreshUrls: got URL from /songs/ fallback");
            return urls;
          }
        }
      } else {
        logger.warn({ sunoAudioId, status: res.status }, "fetchFreshUrls: /songs/ returned non-OK");
      }
    } catch (err) {
      logger.warn({ sunoAudioId, err }, "fetchFreshUrls: /songs/ threw");
    }
  }

  logger.warn({ taskId, sunoAudioId }, "fetchFreshUrls: all strategies exhausted");
  return null;
}
