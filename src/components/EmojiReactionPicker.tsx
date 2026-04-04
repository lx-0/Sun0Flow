"use client";

import { useState, useCallback, useMemo } from "react";

const ALL_EMOJIS = [
  "🔥", "🤯", "😭", "🥵", "💀", "🫶", "👑", "🎸", "😤", "🚀", "💥", "✨",
  "🎵", "🎶", "💜", "🙌", "😍", "🫠", "🤩", "😮‍💨", "🥹", "💫", "🌊", "⚡",
  "🎤", "🪩", "🤘", "💃", "🕺", "🧠", "👏", "😈", "🦋", "🌟", "❤️‍🔥", "🫡",
];

const DISPLAY_COUNT = 12;
const TOP_USED_COUNT = 6;

/** Fisher-Yates shuffle (non-mutating) */
function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface EmojiReactionPickerProps {
  isPlaying: boolean;
  isAuthenticated: boolean;
  onReact: (emoji: string) => void;
  /** Existing reaction emojis for the current song, used to derive "top used" */
  reactionEmojis?: string[];
}

export function EmojiReactionPicker({
  isPlaying,
  isAuthenticated,
  onReact,
  reactionEmojis = [],
}: EmojiReactionPickerProps) {
  const [animating, setAnimating] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<Set<string>>(new Set());

  // Compute displayed emojis: top-used half + random half
  // useMemo keyed on reactionEmojis length so it re-shuffles when reactions change
  const displayEmojis = useMemo(() => {
    // Count emoji frequencies from existing reactions
    const counts = new Map<string, number>();
    for (const e of reactionEmojis) {
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }

    // Top used emojis sorted by frequency (descending), capped at TOP_USED_COUNT
    const topUsed = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_USED_COUNT)
      .map(([emoji]) => emoji);

    // Fill remaining slots with random emojis not already in top-used
    const remaining = ALL_EMOJIS.filter((e) => !topUsed.includes(e));
    const randomPick = shuffled(remaining).slice(0, DISPLAY_COUNT - topUsed.length);

    return [...topUsed, ...randomPick];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactionEmojis.length]);

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
      {displayEmojis.map((emoji) => {
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
