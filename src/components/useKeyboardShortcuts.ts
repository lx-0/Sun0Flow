"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueue } from "./QueueContext";

// ─── Shortcut definitions ────────────────────────────────────────────────────

export interface Shortcut {
  keys: string[];
  label: string;
  category: "navigation" | "playback" | "app";
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ["g", "l"], label: "Go to Library", category: "navigation" },
  { keys: ["g", "g"], label: "Go to Generate", category: "navigation" },
  { keys: ["g", "i"], label: "Go to Inspire", category: "navigation" },
  { keys: ["g", "s"], label: "Go to Settings", category: "navigation" },
  { keys: [" "], label: "Play / Pause", category: "playback" },
  { keys: ["←"], label: "Seek back 10s", category: "playback" },
  { keys: ["→"], label: "Seek forward 10s", category: "playback" },
  { keys: ["↑"], label: "Volume +10%", category: "playback" },
  { keys: ["↓"], label: "Volume −10%", category: "playback" },
  { keys: ["m"], label: "Mute / Unmute", category: "playback" },
  { keys: ["n"], label: "Next track", category: "playback" },
  { keys: ["p"], label: "Previous track", category: "playback" },
  { keys: ["s"], label: "Toggle shuffle", category: "playback" },
  { keys: ["r"], label: "Cycle repeat", category: "playback" },
  { keys: ["N"], label: "New generation", category: "app" },
  { keys: ["?"], label: "Show shortcuts help", category: "app" },
];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useKeyboardShortcuts(
  onShowHelp: () => void,
  onFeedback?: (message: string) => void
) {
  const router = useRouter();
  const {
    togglePlay,
    queue,
    currentIndex,
    seek,
    currentTime,
    duration,
    volume,
    muted,
    setVolume,
    toggleMute,
    skipNext,
    skipPrev,
    toggleShuffle,
    cycleRepeat,
    shuffle,
    repeat,
  } = useQueue();

  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce refs for seek and volume to coalesce rapid key-repeat events
  const seekDeltaRef = useRef(0);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volDeltaRef = useRef(0);
  const volDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep live refs so debounced callbacks see fresh values without re-registering
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  currentTimeRef.current = currentTime;
  durationRef.current = duration;
  volumeRef.current = volume;
  mutedRef.current = muted;
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;

  const seekRef = useRef(seek);
  const setVolumeRef = useRef(setVolume);
  seekRef.current = seek;
  setVolumeRef.current = setVolume;

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const key = e.key;
      const hasQueue = queue.length > 0 && currentIndex >= 0;

      // ── Two-key sequences (g then ...) ──
      if (pendingRef.current === "g") {
        clearPending();
        switch (key) {
          case "g":
            e.preventDefault();
            router.push("/generate");
            return;
          case "l":
            e.preventDefault();
            router.push("/library");
            return;
          case "i":
            e.preventDefault();
            router.push("/inspire");
            return;
          case "s":
            e.preventDefault();
            router.push("/settings");
            return;
        }
        // Unknown second key — ignore
        return;
      }

      // ── First key of a sequence ──
      if (key === "g") {
        e.preventDefault();
        pendingRef.current = "g";
        // Auto-clear if no second key within 800ms
        timerRef.current = setTimeout(clearPending, 800);
        return;
      }

      // ── Playback shortcuts (require active queue) ──

      if (key === " ") {
        if (hasQueue) {
          e.preventDefault();
          togglePlay();
        }
        return;
      }

      if (key === "Enter") {
        if (hasQueue) {
          e.preventDefault();
          togglePlay();
        }
        return;
      }

      if (key === "ArrowRight") {
        if (!hasQueue) return;
        e.preventDefault();
        // Accumulate seek delta, apply after debounce
        seekDeltaRef.current += 10;
        if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = setTimeout(() => {
          const dur = durationRef.current;
          if (dur <= 0) return;
          const next = Math.min(1, (currentTimeRef.current + seekDeltaRef.current) / dur);
          seekRef.current(next);
          seekDeltaRef.current = 0;
        }, 150);
        return;
      }

      if (key === "ArrowLeft") {
        if (!hasQueue) return;
        e.preventDefault();
        seekDeltaRef.current -= 10;
        if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = setTimeout(() => {
          const dur = durationRef.current;
          if (dur <= 0) return;
          const next = Math.max(0, (currentTimeRef.current + seekDeltaRef.current) / dur);
          seekRef.current(next);
          seekDeltaRef.current = 0;
        }, 150);
        return;
      }

      if (key === "ArrowUp") {
        e.preventDefault();
        volDeltaRef.current += 0.1;
        if (volDebounceRef.current) clearTimeout(volDebounceRef.current);
        volDebounceRef.current = setTimeout(() => {
          const next = Math.min(1, Math.max(0, volumeRef.current + volDeltaRef.current));
          setVolumeRef.current(next);
          volDeltaRef.current = 0;
          onFeedback?.(`Volume: ${Math.round(next * 100)}%`);
        }, 150);
        return;
      }

      if (key === "ArrowDown") {
        e.preventDefault();
        volDeltaRef.current -= 0.1;
        if (volDebounceRef.current) clearTimeout(volDebounceRef.current);
        volDebounceRef.current = setTimeout(() => {
          const next = Math.min(1, Math.max(0, volumeRef.current + volDeltaRef.current));
          setVolumeRef.current(next);
          volDeltaRef.current = 0;
          onFeedback?.(`Volume: ${Math.round(next * 100)}%`);
        }, 150);
        return;
      }

      if (key === "m") {
        e.preventDefault();
        toggleMute();
        onFeedback?.(mutedRef.current ? "Unmuted" : "Muted");
        return;
      }

      if (key === "n") {
        if (!hasQueue) return;
        e.preventDefault();
        skipNext();
        return;
      }

      if (key === "p") {
        if (!hasQueue) return;
        e.preventDefault();
        skipPrev();
        return;
      }

      if (key === "s") {
        e.preventDefault();
        toggleShuffle();
        onFeedback?.(shuffleRef.current ? "Shuffle: Off" : "Shuffle: On");
        return;
      }

      if (key === "r") {
        e.preventDefault();
        cycleRepeat();
        const next =
          repeatRef.current === "off"
            ? "repeat-all"
            : repeatRef.current === "repeat-all"
            ? "repeat-one"
            : "off";
        const labels: Record<string, string> = {
          off: "Repeat: Off",
          "repeat-all": "Repeat: All",
          "repeat-one": "Repeat: One",
        };
        onFeedback?.(labels[next]);
        return;
      }

      // ── App shortcuts ──

      if (key === "N") {
        e.preventDefault();
        router.push("/generate");
        return;
      }

      if (key === "?") {
        e.preventDefault();
        onShowHelp();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearPending();
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
      if (volDebounceRef.current) clearTimeout(volDebounceRef.current);
    };
  }, [
    router,
    togglePlay,
    queue,
    currentIndex,
    toggleMute,
    skipNext,
    skipPrev,
    toggleShuffle,
    cycleRepeat,
    onShowHelp,
    onFeedback,
    clearPending,
  ]);
}
