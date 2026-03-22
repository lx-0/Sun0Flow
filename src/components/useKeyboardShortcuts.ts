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
  { keys: ["g", "n"], label: "Go to Generate", category: "navigation" },
  { keys: ["g", "l"], label: "Go to Library", category: "navigation" },
  { keys: ["g", "f"], label: "Go to Favorites", category: "navigation" },
  { keys: ["g", "h"], label: "Go to Home", category: "navigation" },
  { keys: [" "], label: "Play / Pause", category: "playback" },
  { keys: ["Enter"], label: "Play / Pause", category: "playback" },
  { keys: ["N"], label: "New generation", category: "app" },
  { keys: ["?"], label: "Show shortcuts help", category: "app" },
];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useKeyboardShortcuts(onShowHelp: () => void) {
  const router = useRouter();
  const { togglePlay, queue, currentIndex } = useQueue();

  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      // ── Two-key sequences (g then ...) ──
      if (pendingRef.current === "g") {
        clearPending();
        switch (key) {
          case "n":
            e.preventDefault();
            router.push("/generate");
            return;
          case "l":
            e.preventDefault();
            router.push("/library");
            return;
          case "f":
            e.preventDefault();
            router.push("/favorites");
            return;
          case "h":
            e.preventDefault();
            router.push("/");
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

      // ── Single-key shortcuts ──
      if (key === " ") {
        // Only handle space if there's something in the queue
        if (queue.length > 0 && currentIndex >= 0) {
          e.preventDefault();
          togglePlay();
        }
        return;
      }

      if (key === "Enter") {
        // Play/pause with Enter when queue has content
        if (queue.length > 0 && currentIndex >= 0) {
          e.preventDefault();
          togglePlay();
        }
        return;
      }

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
    };
  }, [router, togglePlay, queue, currentIndex, onShowHelp, clearPending]);
}
