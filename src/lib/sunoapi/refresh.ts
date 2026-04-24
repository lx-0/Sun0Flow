import { BASE_URL, buildHeaders } from "./http";

/**
 * Fetch fresh audio/image URLs directly from sunoapi.org, bypassing
 * the circuit breaker. Used by the audio proxy and cache warm-up so
 * URL refresh never gets blocked by breaker state.
 */
export async function fetchFreshUrls(
  taskId: string,
  apiKey?: string
): Promise<{ audioUrl?: string; imageUrl?: string } | null> {
  const res = await fetch(
    `${BASE_URL}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    { method: "GET", headers: buildHeaders(apiKey) }
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    data?: { response?: { sunoData?: Record<string, unknown>[] } };
  };
  const clips = json.data?.response?.sunoData ?? [];
  const match = clips.find((c) => {
    const url = (c.audio_url as string) || (c.audioUrl as string);
    return typeof url === "string" && url;
  });
  if (!match) return null;

  const audioUrl =
    (match.audio_url as string) || (match.audioUrl as string);
  const imageUrl =
    (match.image_url as string) || (match.imageUrl as string) || undefined;
  return { audioUrl, imageUrl };
}
