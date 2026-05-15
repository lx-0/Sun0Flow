"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { track } from "@/lib/analytics";
import {
  getIsVisible,
  subscribeVisibility,
} from "@/lib/realtime/visibility";

export type GenerationStatus = "pending" | "processing" | "ready" | "failed";

export interface GenerationState {
  songId: string;
  status: GenerationStatus;
  title: string | null;
  errorMessage: string | null;
}

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 60;

/**
 * Tracks generation progress using per-job SSE streams for real-time updates,
 * with automatic fallback to polling when SSE is unavailable.
 */
export function useGenerationPoller() {
  const [songs, setSongs] = useState<GenerationState[]>([]);
  const activeRef = useRef(true);
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );
  const pollCountRef = useRef<Map<string, number>>(new Map());
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const stopPolling = useCallback((songId: string) => {
    const interval = intervalsRef.current.get(songId);
    if (interval) {
      clearInterval(interval);
      intervalsRef.current.delete(songId);
    }
    pollCountRef.current.delete(songId);
  }, []);

  const closeSSE = useCallback((songId: string) => {
    const es = eventSourcesRef.current.get(songId);
    if (es) {
      es.close();
      eventSourcesRef.current.delete(songId);
    }
  }, []);

  const stopTracking = useCallback(
    (songId: string) => {
      stopPolling(songId);
      closeSSE(songId);
    },
    [stopPolling, closeSSE]
  );

  const updateSong = useCallback(
    (
      songId: string,
      status: GenerationStatus,
      title?: string | null,
      errorMessage?: string | null
    ) => {
      setSongs((prev) =>
        prev.map((s) =>
          s.songId === songId
            ? {
                ...s,
                status,
                title: title ?? s.title,
                errorMessage: errorMessage ?? null,
              }
            : s
        )
      );

      if (status === "ready") {
        track("song_generation_completed");
        stopTracking(songId);
      } else if (status === "failed") {
        stopTracking(songId);
      }
    },
    [stopTracking]
  );

  const pollSong = useCallback(
    async (songId: string) => {
      if (!activeRef.current) return;
      // Skip network work while the document is hidden — mobile OS would
      // throttle the timer anyway and a stale fetch on resume adds latency.
      if (!getIsVisible()) return;

      const count = (pollCountRef.current.get(songId) ?? 0) + 1;
      pollCountRef.current.set(songId, count);

      if (count > MAX_POLLS) {
        updateSong(songId, "failed", null, "Generation timed out");
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

        updateSong(songId, newStatus, info.title, info.errorMessage);
      } catch {
        // Network error — keep polling
      }
    },
    [updateSong]
  );

  const startPollingFallback = useCallback(
    (songId: string) => {
      // Don't start if already polling
      if (intervalsRef.current.has(songId)) return;

      pollCountRef.current.set(songId, 0);
      const interval = setInterval(() => pollSong(songId), POLL_INTERVAL_MS);
      intervalsRef.current.set(songId, interval);
      pollSong(songId);
    },
    [pollSong]
  );

  const connectSSE = useCallback(
    (songId: string) => {
      // Don't create duplicate connections
      if (eventSourcesRef.current.has(songId)) return;

      const es = new EventSource(`/api/generate/${songId}/stream`);
      eventSourcesRef.current.set(songId, es);

      es.addEventListener("generation_update", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data.songId !== songId) return;

          const status: GenerationStatus =
            data.status === "ready"
              ? "ready"
              : data.status === "failed"
                ? "failed"
                : "processing";

          updateSong(songId, status, data.title, data.errorMessage);
        } catch {
          // Invalid JSON — ignore
        }
      });

      es.onerror = () => {
        // SSE failed — close and fall back to polling
        closeSSE(songId);
        startPollingFallback(songId);
      };
    },
    [updateSong, closeSSE, startPollingFallback]
  );

  const trackSong = useCallback(
    (songId: string, title: string | null) => {
      if (!songId) return;

      setSongs((prev) => {
        if (prev.some((s) => s.songId === songId)) return prev;
        return [
          ...prev,
          { songId, status: "pending", title, errorMessage: null },
        ];
      });

      // Try SSE first; falls back to polling on error
      connectSSE(songId);
    },
    [connectSSE]
  );

  const clearAll = useCallback(() => {
    Array.from(intervalsRef.current.keys()).forEach(stopPolling);
    Array.from(eventSourcesRef.current.keys()).forEach(closeSSE);
    setSongs([]);
  }, [stopPolling, closeSSE]);

  useEffect(() => {
    activeRef.current = true;
    const intervals = intervalsRef.current;
    const pollCounts = pollCountRef.current;
    const eventSources = eventSourcesRef.current;

    // Catch up immediately when the tab becomes visible again so the user
    // doesn't sit on stale "pending" state after returning from lockscreen.
    const unsubVisibility = subscribeVisibility((visible) => {
      if (!visible || !activeRef.current) return;
      for (const songId of intervals.keys()) {
        pollSong(songId);
      }
    });

    return () => {
      activeRef.current = false;
      unsubVisibility();
      Array.from(intervals.values()).forEach((interval) => {
        clearInterval(interval);
      });
      intervals.clear();
      pollCounts.clear();
      Array.from(eventSources.values()).forEach((es) => es.close());
      eventSources.clear();
    };
  }, [pollSong]);

  const sseConnected = useCallback(
    () => eventSourcesRef.current.size > 0,
    []
  );

  return { songs, trackSong, clearAll, sseConnected };
}
