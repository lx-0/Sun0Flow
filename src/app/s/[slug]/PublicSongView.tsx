"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PlayIcon, PauseIcon, MusicalNoteIcon } from "@heroicons/react/24/solid";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface PublicSongViewProps {
  title: string;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  creatorName: string | null;
}

export function PublicSongView({
  title,
  imageUrl,
  audioUrl,
  duration,
  tags,
  creatorName,
}: PublicSongViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);

  function handleTogglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }

  function handleSeek(pct: number) {
    if (!audioRef.current || audioDuration <= 0) return;
    audioRef.current.currentTime = pct * audioDuration;
  }

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Cover art */}
      <div className="relative aspect-square w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fill className="object-cover" sizes="(max-width: 384px) 100vw, 384px" priority />
        ) : (
          <MusicalNoteIcon className="w-20 h-20 text-gray-300 dark:text-gray-700" />
        )}
      </div>

      {/* Song info */}
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
        {creatorName && (
          <p className="text-sm text-gray-500 dark:text-gray-400">by {creatorName}</p>
        )}
        {tags && (
          <p className="text-xs text-gray-500">{tags}</p>
        )}
      </div>

      {/* Audio player */}
      {audioUrl && (
        <div className="space-y-3">
          {/* Play button */}
          <div className="flex justify-center">
            <button
              onClick={handleTogglePlay}
              className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          </div>

          {/* Seek bar */}
          <div className="space-y-1">
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
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioDuration)}</span>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
          />
        </div>
      )}

      {/* Branding */}
      <p className="text-center text-xs text-gray-400 dark:text-gray-600">
        Shared via SunoFlow
      </p>
    </div>
  );
}
