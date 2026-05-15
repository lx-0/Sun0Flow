"use client";

import { useState, useEffect, useCallback } from "react";
import {
  trackSong as trackerTrackSong,
  clearAll as trackerClearAll,
  subscribe as trackerSubscribe,
  isAnySSEConnected,
  type GenerationState,
  type GenerationStatus,
} from "@/lib/realtime/generation-tracker";

export type { GenerationStatus, GenerationState };

/**
 * Subscribes to the singleton generation tracker. The tracker module owns
 * the EventSource pool, polling fallback, and visibility-aware lifecycle —
 * all instances of this hook share the same tracking state, so navigating
 * between mount points (e.g. GenerateForm → MashupStudio) no longer drops
 * in-flight song tracking.
 */
export function useGenerationPoller() {
  const [songs, setSongs] = useState<GenerationState[]>([]);

  useEffect(() => trackerSubscribe(setSongs), []);

  const trackSong = useCallback((songId: string, title: string | null) => {
    trackerTrackSong(songId, title);
  }, []);

  const clearAll = useCallback(() => {
    trackerClearAll();
  }, []);

  const sseConnected = useCallback(() => isAnySSEConnected(), []);

  return { songs, trackSong, clearAll, sseConnected };
}
