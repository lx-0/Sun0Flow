"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PlayIcon,
  PauseIcon,
  ArrowLeftIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  HeartIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import type { SunoSong } from "@/lib/sunoapi";
import { getRating, setRating, type SongRating } from "@/lib/ratings";
import { downloadSongFile } from "@/lib/download";
import { useToast } from "./Toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Star rating widget ────────────────────────────────────────────────────────

interface StarPickerProps {
  value: number;
  onChange: (stars: number) => void;
}

function StarPicker({ value, onChange }: StarPickerProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          className="text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-transform hover:scale-110"
        >
          <span
            className={
              star <= (hovered || value) ? "text-yellow-400" : "text-gray-600"
            }
          >
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Main SongDetailView ──────────────────────────────────────────────────────

export function SongDetailView({ song, isFavorite: initialFavorite = false, sunoJobId }: { song: SunoSong; isFavorite?: boolean; sunoJobId?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(song.duration ?? 0);

  const [rating, setRatingState] = useState<SongRating>({ stars: 0, note: "" });
  const [saved, setSaved] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const hasAudio = Boolean(song.audioUrl);

  // Init audio element and load existing rating
  useEffect(() => {
    const existing = getRating(song.id);
    if (existing) {
      setRatingState(existing);
      setNoteDraft(existing.note);
    }

    if (!hasAudio) return;

    const audio = new Audio(song.audioUrl);
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
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
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
    };
  }, [song.id, song.audioUrl, hasAudio]);

  function handleTogglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }

  function handleSeek(pct: number) {
    const audio = audioRef.current;
    if (!audio || audioDuration <= 0) return;
    audio.currentTime = pct * audioDuration;
  }

  function handleStarChange(stars: number) {
    setRatingState((r) => ({ ...r, stars }));
    setSaved(false);
  }

  async function handleDownload() {
    if (!hasAudio || downloadProgress !== null) return;
    setDownloadError(null);
    try {
      await downloadSongFile(song, setDownloadProgress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadError(msg);
      toast(msg, "error");
    } finally {
      // Keep progress at 100 briefly so user sees completion, then reset
      setTimeout(() => setDownloadProgress(null), 1500);
    }
  }

  function handleSaveRating() {
    if (rating.stars === 0) return;
    const r: SongRating = { stars: rating.stars, note: noteDraft.trim() };
    setRating(song.id, r);
    setRatingState(r);
    setSaved(true);
  }

  async function handleToggleFavorite() {
    const prev = isFavorite;
    const newFav = !prev;
    setIsFavorite(newFav);
    try {
      const res = await fetch(`/api/songs/${song.id}/favorite`, { method: "PATCH" });
      if (!res.ok) {
        setIsFavorite(prev);
        toast("Failed to update favorite", "error");
      } else {
        toast(newFav ? "Added to favorites" : "Removed from favorites", "success");
      }
    } catch {
      setIsFavorite(prev);
      toast("Failed to update favorite", "error");
    }
  }

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors min-h-[44px]"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Library
      </button>

      {/* Cover art */}
      <div className="w-full aspect-square max-h-64 rounded-2xl bg-gray-800 overflow-hidden flex items-center justify-center">
        {song.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.imageUrl}
            alt={song.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <MusicalNoteIcon className="w-20 h-20 text-gray-600" />
        )}
      </div>

      {/* Title + meta */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white flex-1">{song.title}</h1>
          <button
            onClick={handleToggleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              isFavorite ? "text-pink-500" : "text-gray-500 hover:text-pink-400"
            }`}
          >
            {isFavorite ? (
              <HeartIcon className="w-6 h-6" />
            ) : (
              <HeartOutlineIcon className="w-6 h-6" />
            )}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
          {song.tags && (
            <span className="text-sm text-violet-400">{song.tags}</span>
          )}
          {song.duration && (
            <span className="text-sm text-gray-500">
              {formatTime(song.duration)}
            </span>
          )}
          {song.model && (
            <span className="text-sm text-gray-600">{song.model}</span>
          )}
          <span className="text-sm text-gray-600">
            {formatDate(song.createdAt)}
          </span>
          {sunoJobId && (
            <span className="text-sm text-gray-600" title="Suno song ID">
              ID: {sunoJobId}
            </span>
          )}
        </div>
      </div>

      {/* Regenerate button */}
      <Link
        href={`/generate?${new URLSearchParams({
          ...(song.prompt ? { prompt: song.prompt } : {}),
          ...(song.tags ? { tags: song.tags } : {}),
        }).toString()}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
      >
        <ArrowPathIcon className="w-4 h-4" />
        Regenerate with same prompt
      </Link>

      {/* Audio player */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleTogglePlay}
            disabled={!hasAudio}
            aria-label={isPlaying ? "Pause" : "Play"}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              hasAudio
                ? "bg-violet-600 hover:bg-violet-500 text-white"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            {isPlaying ? (
              <PauseIcon className="w-6 h-6" />
            ) : (
              <PlayIcon className="w-6 h-6 ml-0.5" />
            )}
          </button>
          <div className="flex-1 text-sm text-gray-400">
            {hasAudio ? (
              <span>{isPlaying ? "Playing" : "Paused"}</span>
            ) : (
              <span className="text-gray-600">No audio available</span>
            )}
          </div>
        </div>

        {/* Seek bar */}
        <div className="space-y-1">
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
              onChange={(e) => handleSeek(Number(e.target.value) / 100)}
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer disabled:cursor-default min-h-[44px]"
              aria-label="Seek"
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(audioDuration)}</span>
          </div>
        </div>

        {/* Download */}
        <div className="space-y-2">
          <button
            onClick={handleDownload}
            disabled={!hasAudio || downloadProgress !== null}
            aria-label="Download song"
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
              hasAudio && downloadProgress === null
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-gray-800 text-gray-600 cursor-not-allowed"
            }`}
          >
            <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
            {downloadProgress === null
              ? "Download"
              : downloadProgress === 100
              ? "Done ✓"
              : `Downloading… ${downloadProgress}%`}
          </button>

          {/* Progress bar */}
          {downloadProgress !== null && downloadProgress < 100 && (
            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}

          {/* Error */}
          {downloadError && (
            <p className="text-xs text-red-400">{downloadError}</p>
          )}
        </div>
      </div>

      {/* Lyrics */}
      {song.lyrics && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Lyrics</h2>
          <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">
            {song.lyrics}
          </p>
        </div>
      )}

      {/* Prompt */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-2">Prompt</h2>
        <p className="text-sm text-gray-400">{song.prompt}</p>
      </div>

      {/* Rating */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">Your Rating</h2>

        <StarPicker value={rating.stars} onChange={handleStarChange} />

        <textarea
          value={noteDraft}
          onChange={(e) => {
            setNoteDraft(e.target.value);
            setSaved(false);
          }}
          placeholder="Add a note (optional)..."
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveRating}
            disabled={rating.stars === 0}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Save rating
          </button>
          {saved && (
            <span className="text-sm text-green-400">Saved ✓</span>
          )}
        </div>
      </div>
    </div>
  );
}
