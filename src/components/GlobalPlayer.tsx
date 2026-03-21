"use client";

import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import { useQueue } from "./QueueContext";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GlobalPlayer() {
  const {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeat,
    togglePlay,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
    cycleRepeat,
    clearQueue,
  } = useQueue();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  if (!currentSong) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div role="region" aria-label="Audio player" className="fixed bottom-16 left-0 right-0 z-20 px-2 md:bottom-0 md:left-56">
      <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl md:rounded-none md:rounded-t-2xl shadow-2xl border border-gray-700 dark:border-gray-600 overflow-hidden max-w-3xl mx-auto md:mx-0">
        {/* Seek bar (top edge) */}
        <div className="relative h-1 bg-gray-700">
          <div
            className="absolute inset-y-0 left-0 bg-violet-500 transition-all"
            style={{ width: `${pct}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => seek(Number(e.target.value) / 100)}
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer h-8"
            aria-label="Seek"
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          {/* Cover art */}
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-800 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
            {currentSong.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentSong.imageUrl}
                alt={currentSong.title ?? "Song"}
                className="w-full h-full object-cover"
              />
            ) : (
              <MusicalNoteIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            )}
          </div>

          {/* Song info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {currentSong.title ?? "Untitled"}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              <span className="ml-auto">
                {currentIndex + 1} of {queue.length}
              </span>
            </div>
          </div>

          {/* Controls — touch-friendly 44x44 targets */}
          <div className="flex items-center gap-0.5">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
              className={`hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-colors ${
                shuffle
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowsRightLeftIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Skip prev */}
            <button
              onClick={skipPrev}
              aria-label="Previous"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <BackwardIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Play/pause */}
            <button
              onClick={() => togglePlay()}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors"
            >
              {isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6 ml-0.5" />
              )}
            </button>

            {/* Skip next */}
            <button
              onClick={skipNext}
              aria-label="Next"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <ForwardIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Repeat */}
            <button
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeat}`}
              className={`hidden sm:flex relative w-11 h-11 rounded-full items-center justify-center transition-colors ${
                repeat !== "off"
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowPathRoundedSquareIcon className="w-5 h-5" aria-hidden="true" />
              {repeat === "repeat-one" && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold text-violet-400">
                  1
                </span>
              )}
            </button>

            {/* Close */}
            <button
              onClick={clearQueue}
              aria-label="Close player"
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
