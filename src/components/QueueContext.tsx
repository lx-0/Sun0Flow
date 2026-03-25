"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { proxiedAudioUrl } from "@/lib/audio-cdn";
import { track } from "@/lib/analytics";

// ─── Playback state persistence ───────────────────────────────────────────────

const SYNC_DEBOUNCE_MS = 12_000; // save every ~12s of activity

function savePlaybackState(
  songId: string,
  position: number,
  queue: QueueSong[],
  volume: number
) {
  fetch("/api/user/playback-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songId, position, queue, volume }),
  }).catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueSong {
  id: string;
  title: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  lyrics?: string | null;
}

export type RepeatMode = "off" | "repeat-all" | "repeat-one";

interface QueueState {
  /** Songs in play order (shuffled if shuffle is on) */
  queue: QueueSong[];
  /** Current index in queue (-1 = nothing playing) */
  currentIndex: number;
  isPlaying: boolean;
  /** True while audio is buffering / waiting for data */
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  /** Source label shown in player, e.g. playlist or library name */
  playlistSource: string | null;
}

interface QueueActions {
  /** Replace queue with songs and start playing from given index */
  playQueue: (songs: QueueSong[], startIndex?: number, source?: string) => void;
  /** Toggle play/pause for a specific song. If not in queue, plays it solo. */
  togglePlay: (song?: QueueSong) => void;
  /** Insert song immediately after the current track */
  playNext: (song: QueueSong) => void;
  /** Append song to the end of the queue */
  addToQueue: (song: QueueSong) => void;
  /** Remove a track at a given queue index */
  removeFromQueue: (index: number) => void;
  /** Move a track from one index to another */
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (fraction: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clearQueue: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  /** Returns the underlying HTMLAudioElement (for Web Audio API integration) */
  getAudioElement: () => HTMLAudioElement | null;
}

type QueueContextValue = QueueState & QueueActions;

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const QueueContext = createContext<QueueContextValue | null>(null);

export function useQueue(): QueueContextValue {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useQueue must be used within QueueProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function QueueProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Original (unshuffled) queue preserved for unshuffle
  const originalQueueRef = useRef<QueueSong[]>([]);

  // Debounce timer for server-side playback state sync
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for sync (avoid stale closures in debounce callback)
  const volumeRef = useRef(1);

  const scheduleSyncRef = useRef<((songId: string, position: number, queue: QueueSong[]) => void) | null>(null);

  // Track play counts — fire-and-forget POST to avoid double-counting on pause/resume
  const lastTrackedSongRef = useRef<string | null>(null);
  // History timer — log to play history after 5 seconds of a song starting
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackPlay = useCallback((songId: string) => {
    if (lastTrackedSongRef.current === songId) return;
    lastTrackedSongRef.current = songId;
    fetch(`/api/songs/${songId}/play`, { method: "POST" }).catch(() => {});
    track("song_played");
    // Cancel any pending history log for a previous song
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    // Schedule history log after 5 seconds
    historyTimerRef.current = setTimeout(() => {
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      }).catch(() => {});
    }, 5_000);
  }, []);

  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playlistSource, setPlaylistSource] = useState<string | null>(null);

  // Refs for event handlers (avoid stale closures)
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);

  // Tracks songs that failed through the CDN proxy and fell back to direct URL
  const cdnFallbackRef = useRef<Set<string>>(new Set());

  const trackPlayRef = useRef(trackPlay);
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;
  trackPlayRef.current = trackPlay;
  volumeRef.current = volume;

  // Debounced sync function — schedule a save of current playback state
  const scheduleSync = useCallback(
    (songId: string, position: number, syncQueue: QueueSong[]) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        savePlaybackState(songId, position, syncQueue, volumeRef.current);
      }, SYNC_DEBOUNCE_MS);
    },
    []
  );
  scheduleSyncRef.current = scheduleSync;

  /**
   * Returns the audio src for a song, using the CDN proxy by default.
   * Falls back to the direct Suno URL after a proxy error.
   */
  function getAudioSrc(song: QueueSong): string {
    if (cdnFallbackRef.current.has(song.id)) return song.audioUrl;
    return proxiedAudioUrl(song.id);
  }

  // ─── Init audio element ───────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      // Save position on pause so the user can resume from here on another device
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const currentSong = idx >= 0 ? q[idx] : null;
      if (currentSong) {
        scheduleSyncRef.current?.(currentSong.id, audio.currentTime, q);
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onCanPlay = () => setIsBuffering(false);
    const onError = () => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const currentSong = idx >= 0 ? q[idx] : null;

      // If this was a CDN proxy request, fall back to the direct Suno URL
      if (currentSong && !cdnFallbackRef.current.has(currentSong.id)) {
        cdnFallbackRef.current.add(currentSong.id);
        audio.src = currentSong.audioUrl;
        audio.play().catch(() => {
          setIsBuffering(false);
          setIsPlaying(false);
        });
        return;
      }

      setIsBuffering(false);
      setIsPlaying(false);
    };
    const onEnded = () => {
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const rep = repeatRef.current;

      if (rep === "repeat-one") {
        audio.currentTime = 0;
        audio.play().catch(console.error);
        return;
      }

      if (idx < q.length - 1) {
        // Advance to next
        const next = idx + 1;
        setCurrentIndex(next);
        audio.src = getAudioSrc(q[next]);
        setCurrentTime(0);
        setDuration(q[next].duration ?? 0);
        audio.play().catch(console.error);
        trackPlayRef.current(q[next].id);
      } else if (rep === "repeat-all" && q.length > 0) {
        // Wrap to start
        setCurrentIndex(0);
        audio.src = getAudioSrc(q[0]);
        setCurrentTime(0);
        setDuration(q[0].duration ?? 0);
        audio.play().catch(console.error);
        trackPlayRef.current(q[0].id);
      } else {
        // End of queue
        setIsPlaying(false);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.pause();
    };
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const playQueue = useCallback(
    (songs: QueueSong[], startIndex = 0, source?: string) => {
      const audio = audioRef.current;
      if (!audio || songs.length === 0) return;

      setPlaylistSource(source ?? null);
      originalQueueRef.current = songs;

      let playOrder: QueueSong[];
      let playIdx: number;

      if (shuffle) {
        // Shuffle but keep the start song at index 0
        const startSong = songs[startIndex];
        const rest = songs.filter((_, i) => i !== startIndex);
        playOrder = [startSong, ...fisherYatesShuffle(rest)];
        playIdx = 0;
      } else {
        playOrder = songs;
        playIdx = startIndex;
      }

      setQueue(playOrder);
      setCurrentIndex(playIdx);
      setCurrentTime(0);
      setDuration(playOrder[playIdx].duration ?? 0);
      audio.pause();
      audio.src = getAudioSrc(playOrder[playIdx]);
      audio.play().catch(console.error);
      trackPlay(playOrder[playIdx].id);
      scheduleSyncRef.current?.(playOrder[playIdx].id, 0, playOrder);
    },
    [shuffle, trackPlay]
  );

  const togglePlay = useCallback(
    (song?: QueueSong) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (!song) {
        // Simple toggle
        if (isPlaying) {
          audio.pause();
        } else if (currentIndex >= 0 && queue.length > 0) {
          audio.play().catch(console.error);
        }
        return;
      }

      // Check if this song is already the current one
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
      if (currentSong && currentSong.id === song.id) {
        if (isPlaying) {
          audio.pause();
        } else {
          audio.play().catch(console.error);
        }
        return;
      }

      // Song is in the queue but not current — jump to it
      const idx = queue.findIndex((s) => s.id === song.id);
      if (idx >= 0) {
        setCurrentIndex(idx);
        audio.pause();
        audio.src = getAudioSrc(queue[idx]);
        setCurrentTime(0);
        setDuration(queue[idx].duration ?? 0);
        audio.play().catch(console.error);
        return;
      }

      // Not in queue — play as solo
      playQueue([song], 0);
    },
    [isPlaying, currentIndex, queue, playQueue]
  );

  const skipNext = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;

    let next = currentIndex + 1;
    if (next >= queue.length) {
      if (repeat === "repeat-all") {
        next = 0;
      } else {
        return; // End of queue
      }
    }

    setCurrentIndex(next);
    audio.pause();
    audio.src = getAudioSrc(queue[next]);
    setCurrentTime(0);
    setDuration(queue[next].duration ?? 0);
    audio.play().catch(console.error);
    trackPlay(queue[next].id);
  }, [queue, currentIndex, repeat, trackPlay]);

  const skipPrev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;

    // If more than 3 seconds in, restart current song
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    let prev = currentIndex - 1;
    if (prev < 0) {
      if (repeat === "repeat-all") {
        prev = queue.length - 1;
      } else {
        audio.currentTime = 0;
        return;
      }
    }

    setCurrentIndex(prev);
    audio.pause();
    audio.src = getAudioSrc(queue[prev]);
    setCurrentTime(0);
    setDuration(queue[prev].duration ?? 0);
    audio.play().catch(console.error);
    trackPlay(queue[prev].id);
  }, [queue, currentIndex, repeat, trackPlay]);

  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = fraction * duration;
      const q = queueRef.current;
      const idx = currentIndexRef.current;
      const currentSong = idx >= 0 ? q[idx] : null;
      if (currentSong) {
        scheduleSyncRef.current?.(currentSong.id, fraction * duration, q);
      }
    },
    [duration]
  );

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const next = !prev;
      const q = queueRef.current;
      const idx = currentIndexRef.current;

      if (q.length <= 1) return next;

      const currentSong = idx >= 0 ? q[idx] : null;

      if (next) {
        // Turn shuffle ON — shuffle remaining songs after current
        const rest = q.filter((_, i) => i !== idx);
        const shuffled = currentSong
          ? [currentSong, ...fisherYatesShuffle(rest)]
          : fisherYatesShuffle(q);
        setQueue(shuffled);
        setCurrentIndex(0);
      } else {
        // Turn shuffle OFF — restore original order, keep current song playing
        const original = originalQueueRef.current;
        if (original.length > 0 && currentSong) {
          const origIdx = original.findIndex((s) => s.id === currentSong.id);
          setQueue(original);
          setCurrentIndex(origIdx >= 0 ? origIdx : 0);
        }
      }

      return next;
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "repeat-all";
      if (prev === "repeat-all") return "repeat-one";
      return "off";
    });
  }, []);

  const playNext = useCallback((song: QueueSong) => {
    setQueue((prev) => {
      const idx = currentIndexRef.current;
      const next = [...prev];
      next.splice(idx + 1, 0, song);
      return next;
    });
    originalQueueRef.current = [...originalQueueRef.current, song];
  }, []);

  const addToQueue = useCallback((song: QueueSong) => {
    setQueue((prev) => [...prev, song]);
    originalQueueRef.current = [...originalQueueRef.current, song];
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    const audio = audioRef.current;
    setQueue((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    setCurrentIndex((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) {
        // Removing the currently-playing song — stop playback
        if (audio) { audio.pause(); audio.src = ""; }
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        return -1;
      }
      return prev;
    });
  }, []);

  const reorderQueue = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setCurrentIndex((prev) => {
      if (fromIndex === prev) return toIndex;
      if (fromIndex < prev && toIndex >= prev) return prev - 1;
      if (fromIndex > prev && toIndex <= prev) return prev + 1;
      return prev;
    });
  }, []);

  const clearQueue = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setQueue([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaylistSource(null);
    originalQueueRef.current = [];
  }, []);

  // ─── Volume ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0 && muted) setMuted(false);
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  // ─── Current song helper ──────────────────────────────────────────────────

  const getAudioElement = useCallback(() => audioRef.current, []);

  const value: QueueContextValue = {
    queue,
    currentIndex,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    shuffle,
    repeat,
    volume,
    muted,
    playlistSource,
    playQueue,
    togglePlay,
    playNext,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
    cycleRepeat,
    clearQueue,
    setVolume,
    toggleMute,
    getAudioElement,
  };

  return (
    <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
  );
}
