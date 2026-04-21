"use client";

import { useState, useCallback } from "react";
import {
  StopIcon,
  MusicalNoteIcon,
  HandThumbDownIcon,
  ForwardIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon } from "@heroicons/react/24/solid";
import { useQueue, type RadioParams } from "./QueueContext";
import { CoverArtImage } from "./CoverArtImage";
import { AddToPlaylistButton } from "./AddToPlaylistButton";

// ─── Constants ────────────────────────────────────────────────────────────────

const MOODS = [
  { id: "energetic", label: "Energetic", emoji: "⚡" },
  { id: "chill", label: "Chill", emoji: "🌊" },
  { id: "dark", label: "Dark", emoji: "🌑" },
  { id: "uplifting", label: "Uplifting", emoji: "☀️" },
  { id: "melancholic", label: "Melancholic", emoji: "🌧️" },
  { id: "experimental", label: "Experimental", emoji: "🔬" },
  { id: "dreamy", label: "Dreamy", emoji: "✨" },
  { id: "epic", label: "Epic", emoji: "🏔️" },
  { id: "relaxed", label: "Relaxed", emoji: "🍃" },
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "mysterious", label: "Mysterious", emoji: "🔮" },
  { id: "romantic", label: "Romantic", emoji: "💗" },
];

const GENRES = [
  { id: "", label: "Any" },
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "electronic", label: "Electronic" },
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Classical" },
  { id: "hip hop", label: "Hip Hop" },
  { id: "folk", label: "Folk" },
  { id: "ambient", label: "Ambient" },
  { id: "metal", label: "Metal" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MoodRadioView() {
  const {
    queue,
    currentIndex,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    radioState,
    isRadioLoading,
    startRadio,
    stopRadio,
    skipNext,
    radioThumbsDown,
    togglePlay,
  } = useQueue();

  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string>("");

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const isRadioActive = radioState !== null;
  const upcomingCount = Math.max(0, queue.length - currentIndex - 1);

  const handleStartRadio = useCallback(async () => {
    const params: RadioParams = {
      mood: selectedMood,
      genre: selectedGenre || null,
    };
    await startRadio(params);
  }, [selectedMood, selectedGenre, startRadio]);

  const handleStop = useCallback(() => {
    stopRadio();
  }, [stopRadio]);

  const handleThumbsDown = useCallback(() => {
    if (currentSong) {
      radioThumbsDown(currentSong.id);
    }
  }, [currentSong, radioThumbsDown]);

  // ─── Radio active state ──────────────────────────────────────────────────

  if (isRadioActive) {
    const activeMood = MOODS.find((m) => m.id === radioState.mood);

    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 animate-pulse">
              <MusicalNoteIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                {activeMood ? `${activeMood.emoji} ${activeMood.label} Radio` : "Radio"}
              </h1>
              {radioState.genre && (
                <p className="text-sm text-gray-400 capitalize">{radioState.genre}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
          >
            <StopIcon className="w-4 h-4" />
            Stop Radio
          </button>
        </div>

        {/* Now Playing */}
        {currentSong ? (
          <div className="bg-gray-800/60 rounded-2xl p-6 border border-gray-700/50">
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-4">
              Now Playing
            </p>
            <div className="flex gap-4 items-center">
              <div className="relative shrink-0">
                <CoverArtImage
                  src={currentSong.imageUrl ?? ""}
                  alt={currentSong.title ?? "Song"}
                  width={80}
                  height={80}
                  className={`rounded-xl shadow-lg ${isPlaying ? "ring-2 ring-purple-500" : ""}`}
                  songId={currentSong.id}
                />
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                    <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">
                  {currentSong.title ?? "Untitled"}
                </p>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-300"
                    style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6 mt-6">
              <button
                onClick={handleThumbsDown}
                title="Skip and exclude this song"
                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <HandThumbDownIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => togglePlay()}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <PlayIcon className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>
              <button
                onClick={skipNext}
                title="Skip to next song"
                className="p-2 text-gray-500 hover:text-white transition-colors"
              >
                <ForwardIcon className="w-5 h-5" />
              </button>
              <AddToPlaylistButton songId={currentSong.id} songTitle={currentSong.title ?? undefined} />
            </div>
          </div>
        ) : isRadioLoading ? (
          <div className="bg-gray-800/60 rounded-2xl p-8 border border-gray-700/50 flex items-center justify-center gap-3 text-gray-400">
            <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            <span>Finding songs…</span>
          </div>
        ) : null}

        {/* Up Next */}
        {upcomingCount > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-400 mb-3">
              Up next · {upcomingCount} song{upcomingCount !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-col gap-2">
              {queue.slice(currentIndex + 1, currentIndex + 6).map((song) => (
                <div
                  key={song.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-800/70 transition-colors"
                >
                  <CoverArtImage
                    src={song.imageUrl ?? ""}
                    alt={song.title ?? "Song"}
                    width={40}
                    height={40}
                    className="rounded-lg shrink-0"
                    songId={song.id}
                  />
                  <span className="flex-1 text-sm text-gray-300 truncate">
                    {song.title ?? "Untitled"}
                  </span>
                  {song.duration && (
                    <span className="text-xs text-gray-500 shrink-0">
                      {formatTime(song.duration)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change mood button */}
        <button
          onClick={handleStop}
          className="text-sm text-gray-500 hover:text-gray-300 underline underline-offset-2 transition-colors text-center"
        >
          Change mood or genre
        </button>
      </div>
    );
  }

  // ─── Mood selector state ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Mood Radio</h1>
        <p className="text-gray-400 text-sm">
          Pick a vibe and let the music flow — no playlists needed.
        </p>
      </div>

      {/* Mood Grid */}
      <div>
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
          Select a mood
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {MOODS.map((mood) => {
            const isSelected = selectedMood === mood.id;
            return (
              <button
                key={mood.id}
                onClick={() => setSelectedMood(isSelected ? null : mood.id)}
                className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border transition-all text-sm font-medium ${
                  isSelected
                    ? "border-purple-500 bg-purple-500/20 text-purple-300"
                    : "border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-500 hover:bg-gray-800/70"
                }`}
              >
                <span className="text-2xl">{mood.emoji}</span>
                <span>{mood.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Genre Filter */}
      <div>
        <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">
          Genre (optional)
        </p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => {
            const isSelected = selectedGenre === genre.id;
            return (
              <button
                key={genre.id}
                onClick={() => setSelectedGenre(isSelected && genre.id !== "" ? "" : genre.id)}
                className={`px-4 py-2 rounded-full border text-sm transition-all ${
                  isSelected
                    ? "border-purple-500 bg-purple-500/20 text-purple-300"
                    : "border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-500"
                }`}
              >
                {genre.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Start Radio Button */}
      <button
        onClick={handleStartRadio}
        disabled={isRadioLoading}
        className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors shadow-lg"
      >
        {isRadioLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            Finding songs…
          </>
        ) : (
          <>
            <PlayIcon className="w-5 h-5" />
            Start Radio
            {selectedMood && (
              <span className="opacity-70 font-normal">
                · {MOODS.find((m) => m.id === selectedMood)?.label}
              </span>
            )}
          </>
        )}
      </button>

      {!selectedMood && (
        <p className="text-center text-sm text-gray-500">
          Select a mood above, or start with no filter to play random songs.
        </p>
      )}
    </div>
  );
}

// ─── Seed song trigger ────────────────────────────────────────────────────────

interface PlayMoreLikeThisButtonProps {
  songId: string;
  songTitle?: string | null;
  className?: string;
}

/**
 * A small button used on song cards/detail pages to start a radio session
 * seeded from that specific song's mood/genre.
 */
export function PlayMoreLikeThisButton({
  songId,
  songTitle,
  className = "",
}: PlayMoreLikeThisButtonProps) {
  const { startRadio, isRadioLoading } = useQueue();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      await startRadio({ mood: null, genre: null, seedSongId: songId });
    } finally {
      setLoading(false);
    }
  }, [songId, startRadio]);

  const busy = loading || isRadioLoading;

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={songTitle ? `Play more like "${songTitle}"` : "Play more like this"}
      className={`flex items-center gap-1.5 text-sm text-gray-400 hover:text-purple-300 disabled:opacity-50 transition-colors ${className}`}
    >
      {busy ? (
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
      ) : (
        <MusicalNoteIcon className="w-4 h-4" />
      )}
      <span>Play more like this</span>
    </button>
  );
}
