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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueueSong {
  id: string;
  title: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
}

export type RepeatMode = "off" | "repeat-all" | "repeat-one";

interface QueueState {
  /** Songs in play order (shuffled if shuffle is on) */
  queue: QueueSong[];
  /** Current index in queue (-1 = nothing playing) */
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
}

interface QueueActions {
  /** Replace queue with songs and start playing from given index */
  playQueue: (songs: QueueSong[], startIndex?: number) => void;
  /** Toggle play/pause for a specific song. If not in queue, plays it solo. */
  togglePlay: (song?: QueueSong) => void;
  skipNext: () => void;
  skipPrev: () => void;
  seek: (fraction: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clearQueue: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
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

  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);

  // Refs for event handlers (avoid stale closures)
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);

  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  repeatRef.current = repeat;
  shuffleRef.current = shuffle;

  // ─── Init audio element ───────────────────────────────────────────────────
  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
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
        audio.src = q[next].audioUrl;
        setCurrentTime(0);
        setDuration(q[next].duration ?? 0);
        audio.play().catch(console.error);
      } else if (rep === "repeat-all" && q.length > 0) {
        // Wrap to start
        setCurrentIndex(0);
        audio.src = q[0].audioUrl;
        setCurrentTime(0);
        setDuration(q[0].duration ?? 0);
        audio.play().catch(console.error);
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

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, []);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const playQueue = useCallback(
    (songs: QueueSong[], startIndex = 0) => {
      const audio = audioRef.current;
      if (!audio || songs.length === 0) return;

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
      audio.src = playOrder[playIdx].audioUrl;
      audio.play().catch(console.error);
    },
    [shuffle]
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
        audio.src = queue[idx].audioUrl;
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
    audio.src = queue[next].audioUrl;
    setCurrentTime(0);
    setDuration(queue[next].duration ?? 0);
    audio.play().catch(console.error);
  }, [queue, currentIndex, repeat]);

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
    audio.src = queue[prev].audioUrl;
    setCurrentTime(0);
    setDuration(queue[prev].duration ?? 0);
    audio.play().catch(console.error);
  }, [queue, currentIndex, repeat]);

  const seek = useCallback(
    (fraction: number) => {
      const audio = audioRef.current;
      if (!audio || duration <= 0) return;
      audio.currentTime = fraction * duration;
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

  const clearQueue = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    setQueue([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
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

  const value: QueueContextValue = {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    volume,
    muted,
    playQueue,
    togglePlay,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
    cycleRepeat,
    clearQueue,
    setVolume,
    toggleMute,
  };

  return (
    <QueueContext.Provider value={value}>{children}</QueueContext.Provider>
  );
}
