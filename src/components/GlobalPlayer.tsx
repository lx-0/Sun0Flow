"use client";

import { useEffect, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  XMarkIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  HeartIcon,
} from "@heroicons/react/24/solid";
import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  MusicalNoteIcon,
  QueueListIcon,
  DocumentTextIcon,
  HeartIcon as HeartOutlineIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import { useQueue } from "./QueueContext";
import { UpNextPanel } from "./UpNextPanel";
import { LyricsPanel } from "./LyricsPanel";
import { PlayerWaveform } from "./PlayerWaveform";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GlobalPlayer({ sidebarCollapsed }: { sidebarCollapsed?: boolean }) {
  const {
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
    togglePlay,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
    cycleRepeat,
    clearQueue,
    setVolume,
    toggleMute,
  } = useQueue();

  const [showUpNext, setShowUpNext] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  // Fetch favorite status when current song changes
  useEffect(() => {
    if (!currentSong?.id || !session?.user) {
      setIsFavorite(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/songs/${currentSong.id}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data) setIsFavorite(data.isFavorite ?? false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSong?.id, session?.user]);

  async function handleToggleFavorite() {
    if (!currentSong) return;
    const prev = isFavorite;
    const newFav = !prev;
    setIsFavorite(newFav);
    try {
      const res = await fetch(`/api/songs/${currentSong.id}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setIsFavorite(prev);
      }
    } catch {
      setIsFavorite(prev);
    }
  }

  // Close lyrics when navigating to song detail page
  useEffect(() => {
    if (pathname?.includes("/library/")) {
      setShowLyrics(false);
    }
  }, [pathname]);

  // Close lyrics when current song changes to one without lyrics
  useEffect(() => {
    if (!currentSong?.lyrics) {
      setShowLyrics(false);
    }
  }, [currentSong?.id, currentSong?.lyrics]);

  if (!currentSong) return null;

  return (
    <div role="region" aria-label="Audio player" className={`fixed bottom-16 left-0 right-0 z-20 px-2 md:bottom-0 transition-all duration-200 ${sidebarCollapsed ? "md:left-16" : "md:left-56"}`}>
      {/* Lyrics panel */}
      {showLyrics && currentSong?.lyrics && (
        <div className="max-w-3xl mx-auto md:mx-0 mb-1">
          <LyricsPanel
            lyrics={currentSong.lyrics}
            songTitle={currentSong.title}
            onClose={() => setShowLyrics(false)}
          />
        </div>
      )}

      {/* Up Next panel */}
      {showUpNext && (
        <div className="max-w-3xl mx-auto md:mx-0 mb-1">
          <UpNextPanel onClose={() => setShowUpNext(false)} />
        </div>
      )}

      <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl md:rounded-none md:rounded-t-2xl shadow-2xl border border-gray-700 dark:border-gray-600 overflow-hidden max-w-3xl mx-auto md:mx-0">
        {/* Waveform seek bar */}
        <div className="relative h-10 px-2 pt-1 pb-0.5 bg-gray-900 dark:bg-gray-800">
          <PlayerWaveform
            songId={currentSong.id}
            currentTime={currentTime}
            duration={duration}
            isBuffering={isBuffering}
            onSeek={seek}
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2">
          {/* Cover art — hidden on very small screens to save space */}
          <div className="relative flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-800 dark:bg-gray-700 overflow-hidden flex items-center justify-center">
            {currentSong.imageUrl ? (
              <Image
                src={currentSong.imageUrl}
                alt={currentSong.title ?? "Song"}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <MusicalNoteIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            )}
          </div>

          {/* Song info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate" aria-live="polite">
              {currentSong.title ?? "Untitled"}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              <span className="ml-auto hidden sm:inline">
                {currentIndex + 1} of {queue.length}
              </span>
            </div>
          </div>

          {/* Favorite button — only shown when authenticated */}
          {session?.user && (
            <button
              onClick={handleToggleFavorite}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center transition-colors ${
                isFavorite ? "text-pink-500" : "text-gray-400 hover:text-pink-400"
              }`}
            >
              {isFavorite ? (
                <HeartIcon className="w-5 h-5" />
              ) : (
                <HeartOutlineIcon className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Volume — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1 mr-1">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
            >
              {muted || volume === 0 ? (
                <SpeakerXMarkIcon className="w-4 h-4" />
              ) : (
                <SpeakerWaveIcon className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-16 h-1 accent-violet-500 cursor-pointer"
            />
          </div>

          {/* Controls — touch-friendly targets */}
          <div className="flex items-center gap-0">
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
              aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
              disabled={isBuffering}
              className="w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-75 text-white flex items-center justify-center transition-colors"
            >
              {isBuffering ? (
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
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

            {/* Lyrics toggle — only shown when current song has lyrics */}
            {currentSong?.lyrics && (
              <button
                onClick={() => setShowLyrics((v) => !v)}
                aria-label={showLyrics ? "Hide lyrics" : "Show lyrics"}
                aria-expanded={showLyrics}
                className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${
                  showLyrics
                    ? "text-violet-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <DocumentTextIcon className="w-5 h-5" />
              </button>
            )}

            {/* Up Next toggle */}
            <button
              onClick={() => setShowUpNext((v) => !v)}
              aria-label={showUpNext ? "Hide Up Next" : "Show Up Next"}
              aria-expanded={showUpNext}
              className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors ${
                showUpNext
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <QueueListIcon className="w-5 h-5" />
            </button>

            {/* Close */}
            <button
              onClick={clearQueue}
              aria-label="Close player"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
