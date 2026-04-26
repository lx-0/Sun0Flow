"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PlayIcon, PauseIcon, MusicalNoteIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from "@heroicons/react/24/solid";
import * as Sentry from "@sentry/nextjs";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface EmbedSongPlayerProps {
  songId: string;
  title: string;
  creatorName: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  /** "light" | "dark" */
  theme: "light" | "dark";
  /** URL to full song page */
  songUrl: string;
  autoplay?: boolean;
}

export function EmbedSongPlayer({
  songId,
  title,
  creatorName,
  imageUrl,
  audioUrl,
  duration,
  theme,
  songUrl,
  autoplay = false,
}: EmbedSongPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const resolvedAudioUrl = songId ? `/api/audio/public/${songId}` : audioUrl;

  const isDark = theme === "dark";

  function handleTogglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      setAudioError(false);
      setIsBuffering(true);
      audioRef.current.play().catch((err) => {
        setIsBuffering(false);
        setAudioError(true);
        Sentry.captureException(err, {
          tags: { component: "EmbedSongPlayer", songId },
          extra: { audioUrl: resolvedAudioUrl },
        });
      });
    }
  }

  function handleSeek(pct: number) {
    if (!audioRef.current || audioDuration <= 0) return;
    audioRef.current.currentTime = pct * audioDuration;
  }

  function handleVolumeChange(val: number) {
    if (!audioRef.current) return;
    setVolume(val);
    audioRef.current.volume = val;
    if (val > 0) setMuted(false);
  }

  function handleToggleMute() {
    if (!audioRef.current) return;
    const next = !muted;
    setMuted(next);
    audioRef.current.muted = next;
  }

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  const bg = isDark ? "bg-gray-950" : "bg-white";
  const text = isDark ? "text-white" : "text-gray-900";
  const subtext = isDark ? "text-gray-400" : "text-gray-500";
  const trackBg = isDark ? "bg-gray-800" : "bg-gray-200";
  const borderColor = isDark ? "border-gray-800" : "border-gray-200";

  return (
    <div
      className={`flex items-center gap-3 w-full h-[80px] px-3 ${bg} ${text} border ${borderColor} rounded-xl overflow-hidden`}
    >
      {/* Cover art */}
      <div
        className={`relative flex-shrink-0 w-14 h-14 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-100"} overflow-hidden flex items-center justify-center`}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={title} fill className="object-cover" sizes="56px" />
        ) : (
          <MusicalNoteIcon className={`w-7 h-7 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
        )}
      </div>

      {/* Song info + progress */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-semibold truncate">{title}</span>
          {creatorName && (
            <span className={`text-xs ${subtext} truncate flex-shrink-0`}>by {creatorName}</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative h-1 rounded-full overflow-hidden" role="progressbar">
          <div className={`absolute inset-0 ${trackBg} rounded-full`} />
          <div
            className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
          {audioUrl && (
            <input
              type="range"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => handleSeek(Number(e.target.value) / 100)}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              aria-label="Seek"
            />
          )}
        </div>

        <div className={`flex justify-between text-[10px] ${subtext}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1">
        {/* Play/Pause */}
        <button
          onClick={handleTogglePlay}
          disabled={!audioUrl || isBuffering}
          className={`w-9 h-9 rounded-full ${audioError ? "bg-red-500 hover:bg-red-400" : "bg-violet-600 hover:bg-violet-500"} disabled:opacity-70 text-white flex items-center justify-center transition-colors`}
          aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
        >
          {isBuffering ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
            </svg>
          ) : isPlaying ? (
            <PauseIcon className="w-4 h-4" />
          ) : (
            <PlayIcon className="w-4 h-4 ml-0.5" />
          )}
        </button>

        {/* Volume */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleMute}
            className={`${subtext} hover:text-violet-500 transition-colors`}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? (
              <SpeakerXMarkIcon className="w-3 h-3" />
            ) : (
              <SpeakerWaveIcon className="w-3 h-3" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            className="w-10 accent-violet-500"
            aria-label="Volume"
          />
        </div>
      </div>

      {/* SunoFlow link */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1">
        <a
          href={songUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-semibold text-violet-500 hover:text-violet-400 transition-colors whitespace-nowrap"
        >
          Listen on SunoFlow ↗
        </a>
      </div>

      {/* Audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={resolvedAudioUrl ?? undefined}
          preload="metadata"
          autoPlay={autoplay}
          onPlay={() => { setIsPlaying(true); setIsBuffering(false); setAudioError(false); }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          onError={() => {
            setIsPlaying(false);
            setIsBuffering(false);
            setAudioError(true);
            Sentry.captureMessage("Audio load error on embed player", {
              level: "error",
              tags: { component: "EmbedSongPlayer", songId },
              extra: { audioUrl: resolvedAudioUrl },
            });
          }}
        />
      )}
    </div>
  );
}
