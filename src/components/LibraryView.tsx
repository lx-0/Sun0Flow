"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/solid";
import type { SunoSong } from "@/lib/sunoapi";
import { getRatings, type SongRating } from "@/lib/ratings";
import { downloadSongFile } from "@/lib/download";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StarDisplay({ stars }: { stars: number }) {
  return (
    <span className="text-yellow-400 text-xs">
      {"★".repeat(stars)}
      {"☆".repeat(5 - stars)}
    </span>
  );
}

// ─── Inline audio player bar ──────────────────────────────────────────────────

interface PlayerBarProps {
  currentTime: number;
  duration: number;
  hasAudio: boolean;
  onSeek: (pct: number) => void;
}

function PlayerBar({ currentTime, duration, hasAudio, onSeek }: PlayerBarProps) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-2 space-y-1">
      {/* Seek bar */}
      <div className="relative h-1.5 bg-gray-700 rounded-full">
        <div
          className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          disabled={!hasAudio}
          onChange={(e) => onSeek(Number(e.target.value) / 100)}
          className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default h-1.5"
          aria-label="Seek"
        />
      </div>
      {/* Time display */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { label: string; value: number }[] = [
  { label: "All", value: 0 },
  { label: "3★+", value: 3 },
  { label: "4★+", value: 4 },
  { label: "5★", value: 5 },
];

// ─── Main LibraryView ─────────────────────────────────────────────────────────

export function LibraryView({ songs }: { songs: SunoSong[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentSongId, setCurrentSongId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [minStars, setMinStars] = useState(0);
  const [ratings, setRatings] = useState<Record<string, SongRating>>({});

  // per-song download state: progress 0–100, or null when idle
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});

  // Load ratings from localStorage on mount
  useEffect(() => {
    setRatings(getRatings());
    // Create audio element once
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentSongId(null);
      setCurrentTime(0);
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setAudioDuration(audio.duration);

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.pause();
    };
  }, []);

  // Reload ratings when returning to the page (e.g. after rating on detail page)
  useEffect(() => {
    const handleFocus = () => setRatings(getRatings());
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  function handleTogglePlay(song: SunoSong) {
    const audio = audioRef.current;
    if (!audio) return;

    if (!song.audioUrl) return; // no audio available — button is visual-only

    if (currentSongId === song.id) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(console.error);
      }
    } else {
      audio.pause();
      audio.src = song.audioUrl;
      setCurrentSongId(song.id);
      setCurrentTime(0);
      setAudioDuration(song.duration ?? 0);
      audio.play().catch(console.error);
    }
  }

  async function handleDownload(song: SunoSong) {
    if (!song.audioUrl || song.id in downloadProgress) return;
    setDownloadErrors((e) => { const n = { ...e }; delete n[song.id]; return n; });
    setDownloadProgress((p) => ({ ...p, [song.id]: 0 }));
    try {
      await downloadSongFile(song, (pct) =>
        setDownloadProgress((p) => ({ ...p, [song.id]: pct }))
      );
    } catch (err) {
      setDownloadErrors((e) => ({
        ...e,
        [song.id]: err instanceof Error ? err.message : "Download failed",
      }));
    } finally {
      setTimeout(
        () => setDownloadProgress((p) => { const n = { ...p }; delete n[song.id]; return n; }),
        1500
      );
    }
  }

  function handleSeek(pct: number) {
    const audio = audioRef.current;
    if (!audio || audioDuration <= 0) return;
    audio.currentTime = pct * audioDuration;
  }

  // Filter songs by minimum star rating
  const filteredSongs = minStars === 0
    ? songs
    : songs.filter((s) => {
        const r = ratings[s.id];
        if (minStars === 5) return r?.stars === 5;
        return r && r.stars >= minStars;
      });

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Library</h1>
        <p className="text-gray-400 text-sm mt-0.5">{songs.length} songs</p>
      </div>

      {/* Rating filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMinStars(opt.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
              minStars === opt.value
                ? "bg-violet-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Song list */}
      {filteredSongs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">
            {songs.length === 0
              ? "No songs in your library yet."
              : "No songs match this filter."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredSongs.map((song) => {
            const isActive = currentSongId === song.id;
            const rating = ratings[song.id];
            const hasAudio = Boolean(song.audioUrl);
            const dlProgress = downloadProgress[song.id] ?? null;
            const dlError = downloadErrors[song.id] ?? null;
            const isDownloading = dlProgress !== null;

            return (
              <li
                key={song.id}
                className={`bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
                  isActive ? "border-violet-600" : "border-gray-800"
                }`}
              >
                <div className="flex items-center gap-3 px-3 pt-3 pb-2">
                  {/* Cover art / placeholder */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex items-center justify-center">
                    {song.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <MusicalNoteIcon className="w-6 h-6 text-gray-600" />
                    )}
                  </div>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/library/${song.id}`}
                      className="block text-sm font-medium text-white truncate hover:text-violet-400 transition-colors"
                    >
                      {song.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      {song.tags && (
                        <span className="text-xs text-gray-500 truncate">
                          {song.tags.split(",")[0].trim()}
                        </span>
                      )}
                      {song.duration && (
                        <span className="text-xs text-gray-600 flex-shrink-0">
                          {formatTime(song.duration)}
                        </span>
                      )}
                    </div>
                    {rating && (
                      <div className="mt-0.5">
                        <StarDisplay stars={rating.stars} />
                      </div>
                    )}
                  </div>

                  {/* Download button */}
                  <button
                    onClick={() => handleDownload(song)}
                    disabled={!hasAudio || isDownloading}
                    aria-label={
                      isDownloading
                        ? `Downloading ${dlProgress}%`
                        : "Download song"
                    }
                    className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      hasAudio && !isDownloading
                        ? "bg-gray-800 hover:bg-gray-700 text-white"
                        : "bg-gray-800 text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    <ArrowDownTrayIcon className="w-5 h-5" />
                  </button>

                  {/* Play/Pause button */}
                  <button
                    onClick={() => handleTogglePlay(song)}
                    disabled={!hasAudio}
                    aria-label={isActive && isPlaying ? "Pause" : "Play"}
                    className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      hasAudio
                        ? "bg-violet-600 hover:bg-violet-500 text-white"
                        : "bg-gray-800 text-gray-600 cursor-not-allowed"
                    }`}
                  >
                    {isActive && isPlaying ? (
                      <PauseIcon className="w-5 h-5" />
                    ) : (
                      <PlayIcon className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Inline player bar — visible only for active song */}
                {isActive && (
                  <div className="px-3 pb-3">
                    <PlayerBar
                      currentTime={currentTime}
                      duration={audioDuration}
                      hasAudio={hasAudio}
                      onSeek={handleSeek}
                    />
                  </div>
                )}

                {/* Download progress bar */}
                {isDownloading && dlProgress !== null && dlProgress < 100 && (
                  <div className="px-3 pb-2">
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-300"
                        style={{ width: `${dlProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Download error */}
                {dlError && (
                  <div className="px-3 pb-2">
                    <p className="text-xs text-red-400">{dlError}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
