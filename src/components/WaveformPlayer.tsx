"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/solid";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface WaveformPlayerProps {
  audioUrl: string;
  duration?: number;
}

export function WaveformPlayer({ audioUrl, duration }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const initWavesurfer = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      const WaveSurfer = (await import("wavesurfer.js")).default;

      // Clean up previous instance
      if (wsRef.current) {
        wsRef.current.destroy();
      }

      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: "#a78bfa",
        progressColor: "#7c3aed",
        cursorColor: "#7c3aed",
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 64,
        normalize: true,
        url: audioUrl,
        backend: "WebAudio",
      });

      ws.on("ready", () => {
        setTotalDuration(ws.getDuration());
        setLoaded(true);
      });

      ws.on("timeupdate", (time: number) => {
        setCurrentTime(time);
      });

      ws.on("play", () => setIsPlaying(true));
      ws.on("pause", () => setIsPlaying(false));
      ws.on("finish", () => {
        setIsPlaying(false);
        setCurrentTime(0);
      });

      ws.on("error", () => {
        setError(true);
      });

      wsRef.current = ws;
    } catch {
      setError(true);
    }
  }, [audioUrl]);

  useEffect(() => {
    initWavesurfer();

    return () => {
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
    };
  }, [initWavesurfer]);

  function handleTogglePlay() {
    if (!wsRef.current) return;
    wsRef.current.playPause();
  }

  // Fallback: simple progress bar when waveform fails
  if (error) {
    return <FallbackPlayer audioUrl={audioUrl} duration={duration} />;
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          disabled={!loaded}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
            loaded
              ? "bg-violet-600 hover:bg-violet-500 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          {isPlaying ? (
            <PauseIcon className="w-6 h-6" />
          ) : (
            <PlayIcon className="w-6 h-6 ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div ref={containerRef} className="w-full" />
          {!loaded && !error && (
            <div className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          )}
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 pl-15">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(totalDuration)}</span>
      </div>
    </div>
  );
}

// ─── Fallback simple progress bar player ────────────────────────────────────

function FallbackPlayer({
  audioUrl,
  duration,
}: {
  audioUrl: string;
  duration?: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
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
  }, [audioUrl]);

  function handleTogglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(console.error);
  }

  function handleSeek(pct: number) {
    const audio = audioRef.current;
    if (!audio || audioDuration <= 0) return;
    audio.currentTime = pct * audioDuration;
  }

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={handleTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-violet-600 hover:bg-violet-500 text-white transition-colors flex-shrink-0"
        >
          {isPlaying ? (
            <PauseIcon className="w-6 h-6" />
          ) : (
            <PlayIcon className="w-6 h-6 ml-0.5" />
          )}
        </button>
        <div className="flex-1 text-sm text-gray-500 dark:text-gray-400">
          {isPlaying ? "Playing" : "Paused"}
        </div>
      </div>

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
    </div>
  );
}
