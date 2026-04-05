"use client";

import { useEffect, useCallback, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  XMarkIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  MusicalNoteIcon,
  QueueListIcon,
  DocumentTextIcon,
  HeartIcon as HeartOutlineIcon,
  FaceSmileIcon,
  AdjustmentsHorizontalIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon } from "@heroicons/react/24/solid";
import { CoverArtImage } from "./CoverArtImage";
import { useQueue } from "./QueueContext";
import { PlayerWaveform } from "./PlayerWaveform";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { ReactionTimeline, ReactionItem } from "./ReactionTimeline";
import { UpNextPanel } from "./UpNextPanel";
import { LyricsPanel } from "./LyricsPanel";
import { EqualizerPanel } from "./EqualizerPanel";
import { useVerticalSwipe } from "@/hooks/useVerticalSwipe";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ExpandedTab = "none" | "lyrics" | "queue" | "eq";

interface ExpandedPlayerProps {
  onClose: () => void;
  translateY: number;
  isDragging: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  reactions: ReactionItem[];
  onReact: (emoji: string) => void;
  isAuthenticated: boolean;
}

export function ExpandedPlayer({
  onClose,
  translateY,
  isDragging,
  isFavorite,
  onToggleFavorite,
  reactions,
  onReact,
  isAuthenticated,
}: ExpandedPlayerProps) {
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
    setVolume,
    toggleMute,
    shuffleVersions,
    toggleShuffleVersions,
  } = useQueue();

  const [activeTab, setActiveTab] = useState<ExpandedTab>("none");
  const [showReactions, setShowReactions] = useState(false);

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  // Swipe-down to dismiss
  const { handlers: swipeHandlers, translateY: swipeY, isDragging: swipeDragging } = useVerticalSwipe({
    direction: "down",
    onSwipeComplete: onClose,
  });

  const effectiveTranslateY = isDragging ? translateY : swipeDragging ? swipeY : 0;
  const effectiveDragging = isDragging || swipeDragging;

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Back button to close
  useEffect(() => {
    function handlePopState() {
      onClose();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const toggleTab = useCallback((tab: ExpandedTab) => {
    setActiveTab((prev) => (prev === tab ? "none" : tab));
  }, []);

  if (!currentSong) return null;

  return (
    <>
      {/* Backdrop — desktop only, click to close */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm hidden md:block"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Player container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Expanded player"
        className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      >
        <div
          className="w-full h-full md:h-auto md:max-h-[90vh] md:max-w-[480px] md:rounded-2xl bg-gray-950 overflow-y-auto flex flex-col"
          style={{
            transform: effectiveTranslateY > 0 ? `translateY(${effectiveTranslateY}px)` : undefined,
            transition: effectiveDragging ? "none" : "transform 0.3s ease-out",
          }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing md:hidden flex-shrink-0"
            {...swipeHandlers}
          >
            <div className="w-10 h-1 bg-gray-600 rounded-full" />
          </div>

          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <button
              onClick={onClose}
              aria-label="Collapse player"
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            >
              <ChevronDownIcon className="w-6 h-6" />
            </button>
            <span className="text-xs text-gray-500 uppercase tracking-wider">Now Playing</span>
            <div className="w-10" />
          </div>

          {/* Cover art */}
          <div className="flex-shrink-0 flex justify-center px-8 py-4">
            <div className="relative w-60 h-60 sm:w-72 sm:h-72 rounded-2xl bg-gray-800 overflow-hidden shadow-2xl">
              {currentSong.imageUrl ? (
                <CoverArtImage
                  src={currentSong.imageUrl}
                  alt={currentSong.title ?? "Song"}
                  fill
                  className="object-cover"
                  sizes="288px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MusicalNoteIcon className="w-20 h-20 text-gray-600" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>

          {/* Song info */}
          <div className="px-6 py-2 text-center flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">{currentSong.title ?? "Untitled"}</h2>
          </div>

          {/* Waveform + reaction timeline */}
          <div className="relative px-6 py-2 flex-shrink-0">
            <div className="h-14">
              <PlayerWaveform
                songId={currentSong.id}
                currentTime={currentTime}
                duration={duration}
                isBuffering={isBuffering}
                onSeek={seek}
                reactionTimestamps={reactions.map((r) => r.timestamp)}
                commentTimestamps={[]}
              />
            </div>
            {reactions.length > 0 && duration > 0 && (
              <div className="absolute inset-x-6 top-2 bottom-2 pointer-events-none">
                <div className="pointer-events-auto">
                  <ReactionTimeline reactions={reactions} duration={duration} />
                </div>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-4 px-6 py-4 flex-shrink-0">
            <button
              onClick={toggleShuffle}
              aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                shuffle ? "text-violet-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowsRightLeftIcon className="w-5 h-5" />
            </button>

            <button
              onClick={skipPrev}
              aria-label="Previous"
              className="w-12 h-12 flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <BackwardIcon className="w-7 h-7" />
            </button>

            <button
              onClick={() => togglePlay()}
              aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
              disabled={isBuffering}
              className="w-16 h-16 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-75 text-white flex items-center justify-center transition-colors"
            >
              {isBuffering ? (
                <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
                <PauseIcon className="w-8 h-8" />
              ) : (
                <PlayIcon className="w-8 h-8 ml-1" />
              )}
            </button>

            <button
              onClick={skipNext}
              aria-label="Next"
              className="w-12 h-12 flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <ForwardIcon className="w-7 h-7" />
            </button>

            <button
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeat}`}
              className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                repeat !== "off" ? "text-violet-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowPathRoundedSquareIcon className="w-5 h-5" />
              {repeat === "repeat-one" && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold text-violet-400">1</span>
              )}
            </button>
          </div>

          {/* Secondary controls row */}
          <div className="flex items-center justify-center gap-2 px-6 pb-2 flex-shrink-0">
            {/* Volume */}
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
            >
              {muted || volume === 0 ? (
                <SpeakerXMarkIcon className="w-5 h-5" />
              ) : (
                <SpeakerWaveIcon className="w-5 h-5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-24 h-1 accent-violet-500 cursor-pointer"
            />

            {/* Shuffle versions */}
            <button
              onClick={toggleShuffleVersions}
              aria-label={shuffleVersions ? "Shuffle versions on" : "Shuffle versions off"}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                shuffleVersions ? "text-violet-400" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <CubeIcon className="w-5 h-5" />
            </button>

            {/* Emoji reactions */}
            {isPlaying && isAuthenticated && (
              <div className="relative">
                <button
                  onClick={() => setShowReactions((v) => !v)}
                  aria-label={showReactions ? "Hide reactions" : "React with emoji"}
                  aria-expanded={showReactions}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    showReactions ? "text-violet-400 bg-white/10" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  <FaceSmileIcon className="w-5 h-5" />
                </button>
                {showReactions && (
                  <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30">
                    <EmojiReactionPicker
                      isPlaying={isPlaying}
                      isAuthenticated={isAuthenticated}
                      onReact={onReact}
                      reactionEmojis={reactions.map((r) => r.emoji)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Favorite */}
            {isAuthenticated && (
              <button
                onClick={onToggleFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                className={`w-8 h-8 flex items-center justify-center transition-colors ${
                  isFavorite ? "text-pink-500" : "text-gray-400 hover:text-pink-400"
                }`}
              >
                {isFavorite ? <HeartIcon className="w-5 h-5" /> : <HeartOutlineIcon className="w-5 h-5" />}
              </button>
            )}
          </div>

          {/* Tab buttons for inline panels */}
          <div className="flex items-center justify-center gap-1 px-6 py-2 border-t border-gray-800 flex-shrink-0">
            {currentSong.lyrics && (
              <button
                onClick={() => toggleTab("lyrics")}
                className={`px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                  activeTab === "lyrics" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                <DocumentTextIcon className="w-4 h-4 inline mr-1" />
                Lyrics
              </button>
            )}
            <button
              onClick={() => toggleTab("queue")}
              className={`px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                activeTab === "queue" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <QueueListIcon className="w-4 h-4 inline mr-1" />
              Up Next
            </button>
            <button
              onClick={() => toggleTab("eq")}
              className={`px-4 py-2 text-xs font-medium rounded-full transition-colors ${
                activeTab === "eq" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <AdjustmentsHorizontalIcon className="w-4 h-4 inline mr-1" />
              EQ
            </button>
          </div>

          {/* Inline panel content */}
          {activeTab !== "none" && (
            <div className="flex-1 overflow-y-auto px-4 pb-safe">
              {activeTab === "lyrics" && currentSong.lyrics && (
                <LyricsPanel
                  lyrics={currentSong.lyrics}
                  songTitle={currentSong.title ?? "Untitled"}
                  onClose={() => setActiveTab("none")}
                />
              )}
              {activeTab === "queue" && (
                <UpNextPanel onClose={() => setActiveTab("none")} />
              )}
              {activeTab === "eq" && (
                <EqualizerPanel onClose={() => setActiveTab("none")} />
              )}
            </div>
          )}

          {/* Bottom safe area spacer for mobile */}
          <div className="h-safe flex-shrink-0 md:hidden" />
        </div>
      </div>
    </>
  );
}
