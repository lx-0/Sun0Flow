"use client";

import { useEffect } from "react";
import {
  subscribe as subscribeToTracker,
  trackSong,
  type GenerationState,
} from "@/lib/realtime/generation-tracker";
import type { Song } from "@prisma/client";

export type TerminalStatus = "ready" | "failed";

/**
 * Pure selector — given a tracker snapshot and a song id, decide whether
 * the song just reached a terminal status. Extracted so the
 * subscription/effect side can be glue-thin and this is unit-testable.
 */
export function selectTerminalTransition(
  snapshot: GenerationState[],
  songId: string,
): TerminalStatus | null {
  const state = snapshot.find((s) => s.songId === songId);
  if (!state) return null;
  if (state.status === "ready") return "ready";
  if (state.status === "failed") return "failed";
  return null;
}

/**
 * Fetch the full Song row from the status endpoint. The tracker only
 * carries {songId, status, title, errorMessage}, but UI consumers
 * (SongListItem) need audioUrl, imageUrl, duration, etc. on terminal
 * transition. Returns null on any failure — caller decides what to do.
 */
export async function fetchSongAfterTerminal(
  songId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Song | null> {
  try {
    const res = await fetchImpl(`/api/songs/${songId}/status`);
    if (!res.ok) return null;
    const data = (await res.json()) as { song?: Song };
    return data.song ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribe a pending song to the singleton generation tracker. When the
 * tracker observes a terminal transition (ready/failed), fetch the full
 * Song row once and notify the caller via onUpdate.
 *
 * Replaces per-component setTimeout polling. Wins from the tracker:
 *   - One SSE connection per song, regardless of how many components watch
 *   - Polling fallback when SSE fails
 *   - Visibility-aware (no polling/SSE while tab is hidden)
 *   - MAX_POLLS cap shared across all observers
 */
export function useTrackPendingSong(
  song: Song,
  onUpdate: (updated: Song) => void,
): void {
  useEffect(() => {
    if (song.generationStatus !== "pending") return;

    trackSong(song.id, song.title);

    let fired = false;
    const unsubscribe = subscribeToTracker((snapshot) => {
      if (fired) return;
      const terminal = selectTerminalTransition(snapshot, song.id);
      if (!terminal) return;
      fired = true;
      void fetchSongAfterTerminal(song.id).then((updated) => {
        if (updated) onUpdate(updated);
      });
    });

    return unsubscribe;
  }, [song.id, song.generationStatus, song.title, onUpdate]);
}
