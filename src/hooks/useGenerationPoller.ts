"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSSE, SSEEventHandler } from "./useSSE";

export type GenerationStatus = "pending" | "processing" | "ready" | "failed";

export interface GenerationState {
  songId: string;
  status: GenerationStatus;
  title: string | null;
  errorMessage: string | null;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40;

/**
 * Tracks generation progress using SSE for real-time updates,
 * with automatic fallback to polling when SSE is unavailable.
 */
export function useGenerationPoller() {
  const [songs, setSongs] = useState<GenerationState[]>([]);
  const activeRef = useRef(true);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );
  const pollCountRef = useRef<Map<string, number>>(new Map());
  const trackedSongIdsRef = useRef<Set<string>>(new Set());

  const stopPolling = useCallback((songId: string) => {
    const interval = intervalsRef.current.get(songId);
    if (interval) {
      clearInterval(interval);
      intervalsRef.current.delete(songId);
    }
    pollCountRef.current.delete(songId);
  }, []);

  const pollSong = useCallback(
    async (songId: string) => {
      if (!activeRef.current) return;

      const count = (pollCountRef.current.get(songId) ?? 0) + 1;
      pollCountRef.current.set(songId, count);

      if (count > MAX_POLLS) {
        setSongs((prev) =>
          prev.map((s) =>
            s.songId === songId
              ? { ...s, status: "failed", errorMessage: "Generation timed out" }
              : s
          )
        );
        stopPolling(songId);
        return;
      }

      try {
        const res = await fetch(`/api/songs/${songId}/status`);
        if (!res.ok) return;

        const data = await res.json();
        const info = data.song ?? data;
        const newStatus: GenerationStatus =
          info.generationStatus === "ready"
            ? "ready"
            : info.generationStatus === "failed"
              ? "failed"
              : info.pollCount > 0
                ? "processing"
                : "pending";

        setSongs((prev) =>
          prev.map((s) =>
            s.songId === songId
              ? {
                  ...s,
                  status: newStatus,
                  title: info.title ?? s.title,
                  errorMessage: info.errorMessage ?? null,
                }
              : s
          )
        );

        if (newStatus === "ready" || newStatus === "failed") {
          stopPolling(songId);
        }
      } catch {
        // Network error — keep polling
      }
    },
    [stopPolling]
  );

  // Handle SSE generation updates — update state instantly
  const handleGenerationUpdate: SSEEventHandler = useCallback((data) => {
    const songId = data.songId as string;
    if (!songId || !trackedSongIdsRef.current.has(songId)) return;

    const status = data.status as string;
    const newStatus: GenerationStatus =
      status === "ready" ? "ready" : status === "failed" ? "failed" : "processing";

    setSongs((prev) =>
      prev.map((s) =>
        s.songId === songId
          ? {
              ...s,
              status: newStatus,
              title: (data.title as string) ?? s.title,
              errorMessage: (data.errorMessage as string) ?? null,
            }
          : s
      )
    );

    // Stop polling for this song since we got a terminal SSE event
    if (newStatus === "ready" || newStatus === "failed") {
      stopPolling(songId);
    }
  }, [stopPolling]);

  const handlers = useMemo(() => ({
    generation_update: handleGenerationUpdate,
  }), [handleGenerationUpdate]);

  // SSE is enabled whenever we have songs being tracked
  const hasActiveSongs = songs.some((s) => s.status === "pending" || s.status === "processing");
  const { getConnected } = useSSE({
    handlers,
    enabled: hasActiveSongs,
  });

  const startPolling = useCallback(
    (songId: string) => {
      // Always start polling as a fallback; SSE events will stop it early if connected
      pollCountRef.current.set(songId, 0);
      const interval = setInterval(() => pollSong(songId), POLL_INTERVAL_MS);
      intervalsRef.current.set(songId, interval);
      pollSong(songId);
    },
    [pollSong]
  );

  const trackSong = useCallback(
    (songId: string, title: string | null) => {
      if (!songId) return;
      trackedSongIdsRef.current.add(songId);

      setSongs((prev) => {
        if (prev.some((s) => s.songId === songId)) return prev;
        return [
          ...prev,
          { songId, status: "pending", title, errorMessage: null },
        ];
      });

      // If SSE is connected, polling serves as a slower fallback
      // If SSE is not connected, polling is the primary mechanism
      startPolling(songId);
    },
    [startPolling]
  );

  const clearAll = useCallback(() => {
    const currentIntervals = intervalsRef.current;
    Array.from(currentIntervals.keys()).forEach((songId) => {
      stopPolling(songId);
    });
    trackedSongIdsRef.current.clear();
    setSongs([]);
  }, [stopPolling]);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      const currentIntervals = intervalsRef.current;
      const currentPollCounts = pollCountRef.current;
      Array.from(currentIntervals.values()).forEach((interval) => {
        clearInterval(interval);
      });
      currentIntervals.clear();
      currentPollCounts.clear();
    };
  }, []);

  return { songs, trackSong, clearAll, sseConnected: getConnected };
}
