// Pure transport + response-interpretation helpers for the generation-history
// retry + poll flow. Extracted so the load-bearing logic can be unit-tested
// without a DOM test runner.

export interface RetryServerResponse {
  song?: { id: string; [k: string]: unknown };
  error?: string;
  resetAt?: string;
}

export type RetryResult =
  | { kind: "ok"; song: RetryServerResponse["song"] & { id: string } }
  | { kind: "soft-error"; song?: RetryServerResponse["song"]; message: string }
  | { kind: "rate-limit"; minutesUntilReset: number }
  | { kind: "error"; message: string }
  | { kind: "network-error" };

export interface RetryDeps {
  fetch: typeof fetch;
  now?: () => number;
}

export async function retrySong(songId: string, deps: RetryDeps): Promise<RetryResult> {
  let res: Response;
  try {
    res = await deps.fetch(`/api/songs/${songId}/retry`, { method: "POST" });
  } catch {
    return { kind: "network-error" };
  }

  let data: RetryServerResponse;
  try {
    data = (await res.json()) as RetryServerResponse;
  } catch {
    return { kind: "error", message: "Server returned invalid response." };
  }

  if (!res.ok) {
    if (res.status === 429 && data.resetAt) {
      const now = deps.now?.() ?? Date.now();
      const resetMs = new Date(data.resetAt).getTime();
      const minutesUntilReset = Math.max(1, Math.ceil((resetMs - now) / 60000));
      return { kind: "rate-limit", minutesUntilReset };
    }
    return { kind: "error", message: data.error ?? "Retry failed. Please try again." };
  }

  // 2xx but Suno itself rejected (song stays failed with new errorMessage)
  if (data.error) {
    return { kind: "soft-error", song: data.song, message: data.error };
  }

  if (!data.song?.id) {
    return { kind: "error", message: "Server returned no song." };
  }

  return { kind: "ok", song: data.song as RetryServerResponse["song"] & { id: string } };
}

export type PollResult =
  | { kind: "ok"; song: { id: string; [k: string]: unknown } }
  | { kind: "error" };

export async function pollSongStatus(songId: string, deps: RetryDeps): Promise<PollResult> {
  try {
    const res = await deps.fetch(`/api/songs/${songId}/status`);
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as { song?: { id: string; [k: string]: unknown } };
    if (!data.song?.id) return { kind: "error" };
    return { kind: "ok", song: data.song };
  } catch {
    return { kind: "error" };
  }
}

export function mergeSongIntoList<T extends { id: string }>(
  list: T[],
  update: Partial<T> & { id: string },
): T[] {
  return list.map((s) => (s.id === update.id ? { ...s, ...update } : s));
}
