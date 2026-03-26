"use client";

import { useState, useCallback } from "react";
import {
  cacheSong,
  removeSong,
  clearAllCachedSongs,
  getCachedSongIds,
  getCacheStats,
} from "@/lib/offline-cache";
import { useToast } from "@/components/Toast";

export interface UseOfflineCacheReturn {
  /** Set of song IDs currently saved for offline playback */
  cachedIds: Set<string>;
  /** Aggregate cache stats */
  stats: { count: number; totalBytes: number };
  /** Song IDs currently being downloaded */
  saving: Set<string>;
  /** Save a song for offline playback */
  saveOffline: (song: { id: string; title: string | null; imageUrl: string | null }) => Promise<void>;
  /** Remove a song from the offline cache */
  removeOffline: (songId: string) => Promise<void>;
  /** Remove all offline songs */
  clearAll: () => Promise<void>;
  /** Re-read metadata from storage (call after external cache changes) */
  refresh: () => void;
}

export function useOfflineCache(): UseOfflineCacheReturn {
  const { toast } = useToast();

  const [cachedIds, setCachedIds] = useState<Set<string>>(() => getCachedSongIds());
  const [stats, setStats] = useState(() => getCacheStats());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setCachedIds(getCachedSongIds());
    setStats(getCacheStats());
  }, []);

  const saveOffline = useCallback(
    async (song: { id: string; title: string | null; imageUrl: string | null }) => {
      if (saving.has(song.id)) return;
      setSaving((prev) => new Set(prev).add(song.id));
      try {
        await cacheSong(song);
        refresh();
        toast(`"${song.title ?? "Song"}" saved for offline playback`, "success");
      } catch {
        toast("Failed to save song offline. Check your connection.", "error");
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(song.id);
          return next;
        });
      }
    },
    [saving, refresh, toast]
  );

  const removeOffline = useCallback(
    async (songId: string) => {
      try {
        await removeSong(songId);
        refresh();
        toast("Song removed from offline cache", "success");
      } catch {
        toast("Failed to remove song from cache", "error");
      }
    },
    [refresh, toast]
  );

  const clearAll = useCallback(async () => {
    try {
      await clearAllCachedSongs();
      refresh();
      toast("Offline songs cleared", "success");
    } catch {
      toast("Failed to clear offline songs", "error");
    }
  }, [refresh, toast]);

  return { cachedIds, stats, saving, saveOffline, removeOffline, clearAll, refresh };
}
