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
import { useSession } from "next-auth/react";
import { proxiedAudioUrl } from "@/lib/audio-cdn";
import { track } from "@/lib/analytics";

// ─── Playback state persistence ───────────────────────────────────────────────

const SYNC_DEBOUNCE_MS = 12_000; // save every ~12s of activity

function savePlaybackState(
  songId: string,
  position: number,
  queue: QueueSong[],
  volume: number,
  shuffleVersions: boolean,
  shuffle: boolean,
  repeat: string,
  muted: boolean,
  eqGains?: number[],
  eqSpeed?: number,
  eqPitch?: number
) {
  fetch("/api/user/playback-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songId, position, queue, volume, shuffleVersions, shuffle, repeat, muted, eqGains, eqSpeed, eqPitch }),
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

export interface RadioParams {
  mood: string | null;
  genre: string | null;
  tempoMin?: number | null;
  tempoMax?: number | null;
  seedSongId?: string | null;
}

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
  /** Active radio session params, or null when not in radio mode */
  radioState: RadioParams | null;
  /** True while radio is fetching more songs */
  isRadioLoading: boolean;
  /** When true, advancing songs picks a random version (remix/extension) */
  shuffleVersions: boolean;
  /** The version currently playing (null when shuffleVersions is off or song has no variations) */
  activeVersion: QueueSong | null;
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
  /** Start a mood-based radio session */
  startRadio: (params: RadioParams) => Promise<void>;
  /** Stop the radio session and return to normal mode */
  stopRadio: () => void;
  /** Mark a song as disliked — excludes it from future radio fetches */
  radioThumbsDown: (songId: string) => void;
  /** Toggle shuffle-across-versions mode */
  toggleShuffleVersions: () => void;
  /** Ref for AudioEQContext to write current EQ settings into — included in playback saves */
  eqSettingsRef: React.MutableRefObject<{ gains: number[]; speed: number; pitch: number }>;
  /** EQ settings restored from database on session resume (null until loaded) */
  restoredEQ: { gains: number[]; speed: number; pitch: number } | null;
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
  const { status: sessionStatus } = useSession();
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
  const [radioState, setRadioState] = useState<RadioParams | null>(null);
  const [isRadioLoading, setIsRadioLoading] = useState(false);
  const [shuffleVersions, setShuffleVersions] = useState(false);
  const [activeVersion, setActiveVersion] = useState<QueueSong | null>(null);
  const [restoredEQ, setRestoredEQ] = useState<{ gains: number[]; speed: number; pitch: number } | null>(null);
  const eqSettingsRef = useRef({ gains: [0, 0, 0, 0, 0], speed: 1, pitch: 0 });

  // Ref versions for use in callbacks without stale closures
  const radioStateRef = useRef<RadioParams | null>(null);
  const radioExcludedIds = useRef<Set<string>>(new Set());
  radioStateRef.current = radioState;

  // Ref to the radio refill function — set after actions are defined
  const radioRefillRef = useRef<(() => void) | null>(null);

  // Refs for event handlers (avoid stale closures)
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const mutedRef = useRef(muted);

  // Tracks songs that failed through the CDN proxy and fell back to direct URL
  const cdnFallbackRef = useRef<Set<string>>(new Set());

  // Version cache — keyed by queue song ID, stores playable versions for the session
  const versionCacheRef = useRef<Map<string, QueueSong[]>>(new Map());
  const shuffleVersionsRef = useRef(false);
  /** True when audio.play() was rejected (e.g. backgrounded on mobile) */
  const pendingPlayRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pending canplay handler for mobile source-loading fallback */
  const pendingCanPlayRef = useRef<(() => void) | null>(null);
  const skipNextRef = useRef<() => void>(() => {});
  const skipPrevRef = useRef<() => void>(() => {});
  const hasUserGestureRef = useRef(false);

  const trackPlayRef = useRef(trackPlay);
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;
  mutedRef.current = muted;
  trackPlayRef.current = trackPlay;
  volumeRef.current = volume;
  shuffleVersionsRef.current = shuffleVersions;

  // Retry audio.play() with exponential backoff — only for transient play()
  // rejections (AbortError when a new load interrupts play). Source/network
  // errors are handled by the <audio> "error" event, not here.
  const retryPlay = useCallback((audio: HTMLAudioElement, retriesLeft = 3, delay = 300) => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (!hasUserGestureRef.current) {
      pendingPlayRef.current = true;
      return;
    }
    audio.play()
      .then(() => { pendingPlayRef.current = false; })
      .catch((err: DOMException) => {
        if (err.name === "NotAllowedError") {
          pendingPlayRef.current = true;
          return;
        }
        if (err.name === "AbortError" && retriesLeft > 0) {
          retryTimerRef.current = setTimeout(() => retryPlay(audio, retriesLeft - 1, delay * 2), delay);
          return;
        }
        pendingPlayRef.current = true;
      });
  }, []);

  // Debounced sync function — schedule a save of current playback state
  const scheduleSync = useCallback(
    (songId: string, position: number, syncQueue: QueueSong[]) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        const eq = eqSettingsRef.current;
        savePlaybackState(songId, position, syncQueue, volumeRef.current, shuffleVersionsRef.current, shuffleRef.current, repeatRef.current, mutedRef.current, eq.gains, eq.speed, eq.pitch);
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

  // Ref for resolveAndPlay — used inside the audio onEnded handler
  const resolveAndPlayRef = useRef<((song: QueueSong, index: number) => Promise<void>) | null>(null);

  /**
   * Advance to a song, optionally picking a random version when shuffleVersions is on.
   * Uses a per-session cache to avoid repeated version fetches.
   */
  const resolveAndPlay = useCallback(async (song: QueueSong, index: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(song.duration ?? 0);

    // Remove any prior canplay fallback from a previous transition
    if (pendingCanPlayRef.current) {
      audio.removeEventListener("canplay", pendingCanPlayRef.current);
      pendingCanPlayRef.current = null;
    }

    const loadAndPlay = (target: QueueSong) => {
      // Installed PWAs are allowed to autoplay. Setting this before changing
      // src lets the browser auto-start the next track without a play() call,
      // which avoids NotAllowedError on mobile during song transitions.
      audio.autoplay = true;
      audio.src = getAudioSrc(target);

      // Fallback: when the source is ready, try play() directly (bypassing
      // retryPlay's guards) in case autoplay didn't kick in.
      const onCanPlayOnce = () => {
        audio.removeEventListener("canplay", onCanPlayOnce);
        pendingCanPlayRef.current = null;
        if (audio.paused) {
          audio.play()
            .then(() => { pendingPlayRef.current = false; })
            .catch(() => { pendingPlayRef.current = true; });
        }
      };
      pendingCanPlayRef.current = onCanPlayOnce;
      audio.addEventListener("canplay", onCanPlayOnce);

      // Fast path for cached sources (service worker hit)
      retryPlay(audio);
    };

    if (!shuffleVersionsRef.current) {
      setActiveVersion(null);
      loadAndPlay(song);
      trackPlayRef.current(song.id);
      return;
    }

    // Check cache first, then fetch
    let versions = versionCacheRef.current.get(song.id);
    if (!versions) {
      try {
        const res = await fetch(`/api/songs/${song.id}/playable-versions`);
        if (res.ok) {
          const data = await res.json();
          versions = (data.versions ?? []) as QueueSong[];
          versionCacheRef.current.set(song.id, versions);
        }
      } catch {
        // Fall through to play canonical
      }
    }

    if (versions && versions.length > 1) {
      const picked = versions[Math.floor(Math.random() * versions.length)];
      setActiveVersion(picked);
      loadAndPlay(picked);
      trackPlayRef.current(picked.id);
    } else {
      setActiveVersion(null);
      loadAndPlay(song);
      trackPlayRef.current(song.id);
    }
  }, [retryPlay]);

  resolveAndPlayRef.current = resolveAndPlay;

  // ─── Init audio element ───────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => {
      setIsPlaying(true);
      pendingPlayRef.current = false;
      audio.autoplay = false;
    };
    const onPause = () => {
      // When a song ends, the browser fires pause before ended. Skip updating
      // state here so the media session stays "playing" and mobile OS keeps the
      // audio session alive during the transition to the next track.
      if (audio.ended) return;

      setIsPlaying(false);
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

      // One-shot fallback: ask the server to refresh the URL, then retry once.
      // If this also fails, give up — no further retries to avoid 429 cascades.
      if (currentSong && !cdnFallbackRef.current.has(currentSong.id)) {
        cdnFallbackRef.current.add(currentSong.id);
        fetch(`/api/songs/${currentSong.id}/play`, { method: "POST" })
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then((data) => {
            if (!data?.audioUrl) {
              setIsBuffering(false);
              setIsPlaying(false);
              return;
            }
            audio.src = data.audioUrl;
            audio.play().catch(() => {
              setIsBuffering(false);
              setIsPlaying(false);
            });
          })
          .catch(() => {
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
        retryPlay(audio);
        return;
      }

      if (idx < q.length - 1) {
        // Advance to next
        const next = idx + 1;
        resolveAndPlayRef.current?.(q[next], next);

        // Radio auto-refill: when fewer than 3 songs remain, fetch more
        if (radioStateRef.current && q.length - next <= 3) {
          radioRefillRef.current?.();
        }
      } else if (radioStateRef.current) {
        // Radio mode — fetch a new batch when queue is exhausted
        radioRefillRef.current?.();
      } else if (rep === "repeat-all" && q.length > 0) {
        // Wrap to start — allow a new random version pick
        resolveAndPlayRef.current?.(q[0], 0);
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
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (pendingCanPlayRef.current) {
        audio.removeEventListener("canplay", pendingCanPlayRef.current);
        pendingCanPlayRef.current = null;
      }
      audio.pause();
    };
  }, [retryPlay]);

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
      retryPlay(audio);
      trackPlay(playOrder[playIdx].id);
      scheduleSyncRef.current?.(playOrder[playIdx].id, 0, playOrder);
    },
    [shuffle, trackPlay, retryPlay]
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
          audio.play().catch(() => {});
        }
        return;
      }

      // Check if this song is already the current one
      const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
      if (currentSong && currentSong.id === song.id) {
        if (isPlaying) {
          audio.pause();
        } else {
          audio.play().catch(() => {});
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
        audio.play().catch(() => {});
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

    audio.pause();
    resolveAndPlay(queue[next], next);
  }, [queue, currentIndex, repeat, resolveAndPlay]);

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

    audio.pause();
    resolveAndPlay(queue[prev], prev);
  }, [queue, currentIndex, repeat, resolveAndPlay]);

  skipNextRef.current = skipNext;
  skipPrevRef.current = skipPrev;

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

  const toggleShuffleVersions = useCallback(() => {
    setShuffleVersions((prev) => {
      const next = !prev;
      if (!next) setActiveVersion(null);
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
    setRadioState(null);
    radioExcludedIds.current = new Set();
    originalQueueRef.current = [];
    setActiveVersion(null);
    versionCacheRef.current = new Map();
  }, []);

  // ─── Radio actions ─────────────────────────────────────────────────────────

  const fetchRadioSongs = useCallback(
    async (params: RadioParams, excludeIds: string[]): Promise<QueueSong[]> => {
      const url = new URL("/api/radio", window.location.origin);
      if (params.mood) url.searchParams.set("mood", params.mood);
      if (params.genre) url.searchParams.set("genre", params.genre);
      if (params.tempoMin != null) url.searchParams.set("tempoMin", String(params.tempoMin));
      if (params.tempoMax != null) url.searchParams.set("tempoMax", String(params.tempoMax));
      if (params.seedSongId) url.searchParams.set("seedSongId", params.seedSongId);
      if (excludeIds.length > 0) url.searchParams.set("excludeIds", excludeIds.join(","));
      url.searchParams.set("limit", "20");

      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = await res.json();
      return (data.songs ?? []) as QueueSong[];
    },
    []
  );

  const startRadio = useCallback(
    async (params: RadioParams) => {
      setIsRadioLoading(true);
      radioExcludedIds.current = new Set();
      try {
        const songs = await fetchRadioSongs(params, []);
        if (songs.length === 0) {
          setIsRadioLoading(false);
          return;
        }
        setRadioState(params);
        // Mark all fetched IDs as known so we don't repeat them
        songs.forEach((s) => radioExcludedIds.current.add(s.id));
        playQueue(songs, 0, params.mood ? `Radio: ${params.mood}` : "Radio");
      } finally {
        setIsRadioLoading(false);
      }
    },
    [fetchRadioSongs, playQueue]
  );

  const stopRadio = useCallback(() => {
    setRadioState(null);
    radioExcludedIds.current = new Set();
    setPlaylistSource(null);
  }, []);

  const radioThumbsDown = useCallback((songId: string) => {
    radioExcludedIds.current.add(songId);
    // Remove the song from the queue if it hasn't been played yet
    setQueue((prev) => {
      const idx = currentIndexRef.current;
      const songIdx = prev.findIndex((s, i) => s.id === songId && i > idx);
      if (songIdx < 0) return prev;
      const next = [...prev];
      next.splice(songIdx, 1);
      return next;
    });
    // If it's the current song, skip to next
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (idx >= 0 && q[idx]?.id === songId) {
      skipNext();
    }
  }, [skipNext]);

  // Wire up the refill callback used inside the audio onEnded handler
  const radioRefill = useCallback(() => {
    const params = radioStateRef.current;
    if (!params) return;
    const excludeIds = Array.from(radioExcludedIds.current);
    fetchRadioSongs(params, excludeIds).then((songs) => {
      if (songs.length === 0) return;
      songs.forEach((s) => radioExcludedIds.current.add(s.id));
      const audio = audioRef.current;
      setQueue((prev) => {
        const merged = [...prev, ...songs];
        // If nothing is playing, start from first new song
        if (currentIndexRef.current < 0 && merged.length > 0 && audio) {
          const firstNew = prev.length;
          setCurrentIndex(firstNew);
          audio.src = getAudioSrc(merged[firstNew]);
          setCurrentTime(0);
          setDuration(merged[firstNew].duration ?? 0);
          retryPlay(audio);
          trackPlayRef.current(merged[firstNew].id);
        }
        return merged;
      });
    });
  }, [fetchRadioSongs, retryPlay]);

  radioRefillRef.current = radioRefill;

  // ─── Visibility change recovery for background playback ────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && pendingPlayRef.current && hasUserGestureRef.current) {
        const audio = audioRef.current;
        if (audio && audio.src && audio.paused) {
          audio.play()
            .then(() => { pendingPlayRef.current = false; })
            .catch(() => {});
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // ─── Resume pending playback on first user gesture ─────────────────────
  useEffect(() => {
    const onGesture = () => {
      hasUserGestureRef.current = true;
      if (pendingPlayRef.current) {
        const audio = audioRef.current;
        if (audio && audio.src && audio.paused) {
          audio.play()
            .then(() => { pendingPlayRef.current = false; })
            .catch(() => {});
        }
      }
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchstart", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
    document.addEventListener("click", onGesture);
    document.addEventListener("touchstart", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("click", onGesture);
      document.removeEventListener("touchstart", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, []);

  // ─── Media Session API — action handlers (registered once) ─────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
      skipNextRef.current();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      skipPrevRef.current();
    });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      const audio = audioRef.current;
      if (audio && details.seekTime != null) {
        audio.currentTime = details.seekTime;
      }
    });
  }, []);

  // ─── Media Session API — metadata (updates when song changes) ──────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const song = currentIndex >= 0 ? queue[currentIndex] : null;
    const displaySong = activeVersion ?? song;
    if (!displaySong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displaySong.title ?? "Untitled",
      artist: "SunoFlow",
      artwork: displaySong.imageUrl
        ? [{ src: displaySong.imageUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });
  }, [queue, currentIndex, activeVersion]);

  // ─── Media Session API — playback state ────────────────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // ─── Auto-restore saved playback state on mount ────────────────────────
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (sessionStatus !== "authenticated" || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    fetch("/api/user/playback-state")
      .then((r) => r.json())
      .then((data) => {
        if (!data.state?.song?.audioUrl) return;
        const { song, position, queue: savedQueue, volume: savedVol, shuffleVersions: savedShuffleVersions, shuffle: savedShuffle, repeat: savedRepeat, muted: savedMuted, eqGains: savedEqGains, eqSpeed: savedEqSpeed, eqPitch: savedEqPitch } = data.state;
        const audio = audioRef.current;
        if (!audio) return;

        // Build a queue from saved state
        const restoreQueue: QueueSong[] =
          Array.isArray(savedQueue) && savedQueue.length > 0
            ? savedQueue
            : [
                {
                  id: song.id,
                  title: song.title,
                  audioUrl: song.audioUrl,
                  imageUrl: song.imageUrl,
                  duration: song.duration,
                  lyrics: song.lyrics,
                },
              ];

        const startIdx = restoreQueue.findIndex((s: QueueSong) => s.id === song.id);
        const idx = startIdx >= 0 ? startIdx : 0;

        // Load the queue state without auto-playing
        originalQueueRef.current = restoreQueue;
        setQueue(restoreQueue);
        setCurrentIndex(idx);
        setPlaylistSource("Resume");
        setDuration(restoreQueue[idx].duration ?? 0);

        // Set the audio source but don't play
        audio.autoplay = false;
        audio.src = proxiedAudioUrl(restoreQueue[idx].id);

        // Restore shuffleVersions
        if (savedShuffleVersions === true) {
          setShuffleVersions(true);
        }

        // Restore shuffle, repeat, muted
        if (savedShuffle === true) {
          setShuffle(true);
        }
        if (savedRepeat && ["repeat-all", "repeat-one"].includes(savedRepeat)) {
          setRepeat(savedRepeat as RepeatMode);
        }
        if (savedMuted === true) {
          setMuted(true);
        }

        // Restore volume
        const vol = typeof savedVol === "number" ? savedVol : 1;
        setVolumeState(vol);
        volumeRef.current = vol;
        audio.volume = vol;

        // Restore EQ settings for AudioEQContext to pick up
        if (Array.isArray(savedEqGains) && savedEqGains.length === 5) {
          const eq = {
            gains: savedEqGains as number[],
            speed: typeof savedEqSpeed === "number" ? savedEqSpeed : 1,
            pitch: typeof savedEqPitch === "number" ? savedEqPitch : 0,
          };
          eqSettingsRef.current = eq;
          setRestoredEQ(eq);
        }

        // Seek to saved position after audio loads
        if (position > 0 && song.duration) {
          const handleCanPlay = () => {
            audio.currentTime = position;
            audio.removeEventListener("canplay", handleCanPlay);
          };
          audio.addEventListener("canplay", handleCanPlay);
        }
      })
      .catch(() => {});
  }, [sessionStatus]);

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
    radioState,
    isRadioLoading,
    shuffleVersions,
    activeVersion,
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
    startRadio,
    stopRadio,
    radioThumbsDown,
    toggleShuffleVersions,
    eqSettingsRef,
    restoredEQ,
  };

  return (
    <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
  );
}
