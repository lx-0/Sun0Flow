"use client";

import { useState, useCallback } from "react";

const PRESET_EMOJIS = ["🔥", "❤️", "😂", "😮", "👏", "🎵", "💯", "✨"];

interface EmojiReactionPickerProps {
  isPlaying: boolean;
  isAuthenticated: boolean;
  onReact: (emoji: string) => void;
}

export function EmojiReactionPicker({
  isPlaying,
  isAuthenticated,
  onReact,
}: EmojiReactionPickerProps) {
  const [animating, setAnimating] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<Set<string>>(new Set());

  const handleClick = useCallback(
    (emoji: string) => {
      if (debounced.has(emoji)) return;

      onReact(emoji);

      // Animate
      setAnimating(emoji);
      setTimeout(() => setAnimating(null), 400);

      // Debounce
      setDebounced((prev) => new Set(prev).add(emoji));
      setTimeout(() => {
        setDebounced((prev) => {
          const next = new Set(prev);
          next.delete(emoji);
          return next;
        });
      }, 400);
    },
    [debounced, onReact]
  );

  if (!isPlaying || !isAuthenticated) return null;

  return (
    <div
      role="toolbar"
      aria-label="Emoji reactions"
      className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm"
    >
      {PRESET_EMOJIS.map((emoji) => {
        const isAnimating = animating === emoji;
        const isDisabled = debounced.has(emoji);
        return (
          <button
            key={emoji}
            onClick={() => handleClick(emoji)}
            disabled={isDisabled}
            aria-label={`React with ${emoji}`}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full text-lg transition-all",
              "hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isAnimating ? "scale-125 opacity-0" : "scale-100 opacity-100",
            ].join(" ")}
            style={{ transitionDuration: isAnimating ? "400ms" : "150ms" }}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
