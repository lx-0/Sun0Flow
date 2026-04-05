"use client";

import { useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
} from "@heroicons/react/24/solid";
import {
  MusicalNoteIcon,
  BookmarkIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/Toast";
import { ShareMenu } from "@/components/ShareMenu";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPlayCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M plays`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k plays`;
  return `${count} play${count !== 1 ? "s" : ""}`;
}

interface PlaylistSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
}

interface PublicPlaylistViewProps {
  playlistId: string;
  slug: string;
  name: string;
  description: string | null;
  creatorName: string;
  songs: PlaylistSong[];
  totalDuration: number;
  createdAt: string;
  isPublished: boolean;
  playCount: number;
}

export function PublicPlaylistView({
  playlistId,
  slug,
  name,
  description,
  creatorName,
  songs,
  totalDuration,
  createdAt,
  isPublished,
  playCount,
}: PublicPlaylistViewProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isCopying, setIsCopying] = useState(false);
  const playTrackedRef = useRef(false);

  const playableSongs = songs.filter((s) => s.audioUrl);
  const currentSong = currentIndex >= 0 ? playableSongs[currentIndex] : null;

  const playSong = useCallback(
    (index: number) => {
      const song = playableSongs[index];
      if (!song?.audioUrl || !audioRef.current) return;
      setCurrentIndex(index);
      audioRef.current.src = song.audioUrl;
      audioRef.current.play().catch(console.error);

      // Track play count once per session per playlist
      if (!playTrackedRef.current) {
        playTrackedRef.current = true;
        fetch(`/api/playlists/${playlistId}/play`, { method: "POST" }).catch(
          () => {}
        );
      }
    },
    [playableSongs, playlistId]
  );

  function handleTogglePlay(songIndex?: number) {
    if (!audioRef.current) return;

    if (songIndex !== undefined) {
      // Clicking a specific song
      const playableIdx = playableSongs.findIndex(
        (s) => s.id === songs[songIndex].id
      );
      if (playableIdx === -1) return;

      if (playableIdx === currentIndex) {
        // Toggle current
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play().catch(console.error);
        }
      } else {
        playSong(playableIdx);
      }
      return;
    }

    // Global toggle
    if (currentIndex === -1 && playableSongs.length > 0) {
      playSong(0);
    } else if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }

  function handleNext() {
    if (currentIndex < playableSongs.length - 1) {
      playSong(currentIndex + 1);
    }
  }

  function handlePrev() {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
    } else if (currentIndex > 0) {
      playSong(currentIndex - 1);
    }
  }

  function handleEnded() {
    if (currentIndex < playableSongs.length - 1) {
      playSong(currentIndex + 1);
    } else {
      setIsPlaying(false);
      setCurrentIndex(-1);
      setCurrentTime(0);
    }
  }

  function handleSeek(pct: number) {
    if (!audioRef.current || audioDuration <= 0) return;
    audioRef.current.currentTime = pct * audioDuration;
  }

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  async function handleAddToLibrary() {
    if (isCopying) return;
    setIsCopying(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/copy`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        toast(`"${data.playlist.name}" added to your library`, "success");
      } else {
        const data = await res.json().catch(() => ({}));
        if (data.code === "LIMIT_REACHED") {
          toast("Playlist limit reached (50)", "error");
        } else {
          toast("Failed to add to library", "error");
        }
      }
    } catch {
      toast("Failed to add to library", "error");
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Header */}
      <div className="text-center space-y-2 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          by {creatorName}
        </p>
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {description}
          </p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {songs.length} song{songs.length !== 1 ? "s" : ""}
          {totalDuration > 0 && ` · ${formatTime(totalDuration)}`}
          {playCount > 0 && ` · ${formatPlayCount(playCount)}`}
          {" · "}
          {new Date(createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>

        {isPublished && (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-medium">
            <CheckBadgeIcon className="w-3.5 h-3.5" />
            Published on SunoFlow
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <ShareMenu
            url={`${typeof window !== "undefined" ? window.location.origin : ""}/p/${slug}`}
            title={name}
            text={`Listen to "${name}" on SunoFlow`}
            source="public_playlist"
            embedUrl={`/embed/playlist/${slug}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          />

          {session ? (
            <button
              onClick={handleAddToLibrary}
              disabled={isCopying}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
            >
              <BookmarkIcon className="w-4 h-4" />
              {isCopying ? "Adding…" : "Add to library"}
            </button>
          ) : (
            <Link
              href={`/auth/signin?callbackUrl=/p/${slug}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              <BookmarkIcon className="w-4 h-4" />
              Add to library
            </Link>
          )}
        </div>
      </div>

      {/* Player controls */}
      {playableSongs.length > 0 && (
        <div className="space-y-3 mb-6">
          {/* Current track info */}
          {currentSong && (
            <p className="text-center text-sm font-medium truncate px-4">
              {currentSong.title ?? "Untitled"}
            </p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handlePrev}
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Previous"
            >
              <BackwardIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleTogglePlay()}
              className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
            <button
              onClick={handleNext}
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              aria-label="Next"
            >
              <ForwardIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Seek bar */}
          {currentSong && (
            <div className="space-y-1 px-4">
              <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div
                  className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => handleSeek(Number(e.target.value) / 100)}
                  className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer min-h-[44px]"
                  aria-label="Seek"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(audioDuration)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Song list */}
      <ul className="space-y-1">
        {songs.map((song, index) => {
          const playableIdx = playableSongs.findIndex(
            (s) => s.id === song.id
          );
          const isActive = playableIdx === currentIndex && currentIndex >= 0;
          const hasAudio = Boolean(song.audioUrl);

          return (
            <li
              key={song.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                isActive
                  ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700"
                  : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
              }`}
            >
              {/* Position */}
              <span className="flex-shrink-0 w-6 text-xs text-gray-400 dark:text-gray-500 text-center">
                {index + 1}
              </span>

              {/* Cover art */}
              <div className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                {song.imageUrl ? (
                  <Image
                    src={song.imageUrl}
                    alt={song.title ?? "Song"}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                )}
              </div>

              {/* Title + duration */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {song.title ?? "Untitled"}
                </p>
                {song.duration && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatTime(song.duration)}
                  </span>
                )}
              </div>

              {/* Play button */}
              <button
                onClick={() => handleTogglePlay(index)}
                disabled={!hasAudio}
                aria-label={isActive && isPlaying ? "Pause" : "Play"}
                className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  hasAudio
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isActive && isPlaying ? (
                  <PauseIcon className="w-5 h-5" />
                ) : (
                  <PlayIcon className="w-5 h-5 ml-0.5" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Branding */}
      <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
        Shared via SunoFlow
      </p>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() =>
          setAudioDuration(audioRef.current?.duration ?? 0)
        }
      />
    </div>
  );
}
