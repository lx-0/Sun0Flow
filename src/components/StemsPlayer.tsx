"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ScissorsIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  PlayIcon,
  PauseIcon,
} from "@heroicons/react/24/solid";

export interface StemTrack {
  id: string;
  title: string | null;
  audioUrl: string | null;
  generationStatus: string;
  duration: number | null;
}

interface TrackState {
  muted: boolean;
  soloed: boolean;
  volume: number;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface StemsPlayerProps {
  stems: StemTrack[];
  onDownload: (stem: StemTrack) => void;
  onDownloadAll: () => void;
  downloadingAll: boolean;
}

export function StemsPlayer({ stems, onDownload, onDownloadAll, downloadingAll }: StemsPlayerProps) {
  const readyStems = stems.filter((s) => s.generationStatus === "ready" && s.audioUrl);
  const pendingStems = stems.filter((s) => s.generationStatus !== "ready" && s.generationStatus !== "failed");
  const hasMultipleReady = readyStems.length > 1;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackStates, setTrackStates] = useState<TrackState[]>(() =>
    stems.map(() => ({ muted: false, soloed: false, volume: 1 }))
  );

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const gainNodes = useRef<(GainNode | null)[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const connectedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  const stemsLength = stems.length;
  useEffect(() => {
    setTrackStates((prev) => {
      if (prev.length === stemsLength) return prev;
      return Array.from({ length: stemsLength }, (_, i) => prev[i] ?? { muted: false, soloed: false, volume: 1 });
    });
  }, [stemsLength]);

  useEffect(() => {
    const first = readyStems[0];
    if (first?.duration) setDuration(first.duration);
  }, [readyStems]);

  const startTimeTracking = useCallback(() => {
    const tick = () => {
      const lead = audioRefs.current.find((a) => a && !a.paused);
      if (lead && !seekingRef.current) {
        setCurrentTime(lead.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const audios = audioRefs.current;
    const ctx = audioCtxRef;
    return () => {
      stopTimeTracking();
      audios.forEach((a) => {
        if (a) { a.pause(); a.src = ""; }
      });
      if (ctx.current) {
        ctx.current.close().catch(() => {});
      }
    };
  }, [stopTimeTracking]);

  function getEffectiveGain(idx: number, states: TrackState[]): number {
    const hasSolo = states.some((t) => t.soloed);
    const t = states[idx];
    if (!t) return 0;
    if (hasSolo && !t.soloed) return 0;
    if (t.muted) return 0;
    return t.volume;
  }

  function applyGain(idx: number, states: TrackState[]) {
    const gn = gainNodes.current[idx];
    if (gn) gn.gain.value = getEffectiveGain(idx, states);
  }

  function connectWebAudio() {
    if (connectedRef.current) return;
    if (typeof AudioContext === "undefined") return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    readyStems.forEach((_, i) => {
      const audio = audioRefs.current[i];
      if (!audio) return;
      if (gainNodes.current[i]) return;
      try {
        const src = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = getEffectiveGain(i, trackStates);
        src.connect(gain);
        gain.connect(ctx.destination);
        gainNodes.current[i] = gain;
      } catch {
        // Already connected or not supported
      }
    });
    connectedRef.current = true;
  }

  async function handlePlay() {
    if (!hasMultipleReady) return;
    connectWebAudio();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    const leader = audioRefs.current.find((a) => a);
    const syncTime = leader?.currentTime ?? currentTime;
    audioRefs.current.forEach((a) => {
      if (a && Math.abs(a.currentTime - syncTime) > 0.1) {
        a.currentTime = syncTime;
      }
    });
    await Promise.all(
      audioRefs.current
        .filter((a): a is HTMLAudioElement => a !== null)
        .map((a) => a.play().catch(() => {}))
    );
    setIsPlaying(true);
    startTimeTracking();
  }

  function handlePause() {
    audioRefs.current.forEach((a) => a?.pause());
    setIsPlaying(false);
    stopTimeTracking();
  }

  function handleSeek(value: number) {
    seekingRef.current = true;
    setCurrentTime(value);
    audioRefs.current.forEach((a) => {
      if (a) a.currentTime = value;
    });
    seekingRef.current = false;
  }

  function handleEnded() {
    setIsPlaying(false);
    setCurrentTime(0);
    stopTimeTracking();
    audioRefs.current.forEach((a) => { if (a) a.currentTime = 0; });
  }

  function toggleMute(idx: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, muted: !t.muted } : t);
      applyGain(idx, next);
      return next;
    });
  }

  function toggleSolo(idx: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, soloed: !t.soloed } : t);
      next.forEach((_, i) => applyGain(i, next));
      return next;
    });
  }

  function handleVolume(idx: number, value: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, volume: value } : t);
      applyGain(idx, next);
      return next;
    });
  }

  const hasSolo = trackStates.some((t) => t.soloed);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <ScissorsIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
          Stems Preview
        </h2>
        {readyStems.length > 1 && (
          <button
            onClick={onDownloadAll}
            disabled={downloadingAll}
            className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-50 transition-colors"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            {downloadingAll ? "Preparing…" : "Download All"}
          </button>
        )}
      </div>

      {pendingStems.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Processing {pendingStems.length} stem{pendingStems.length > 1 ? "s" : ""}…
        </div>
      )}

      <div className="space-y-2">
        {stems.map((stem, idx) => {
          const ts = trackStates[idx] ?? { muted: false, soloed: false, volume: 1 };
          const isReady = stem.generationStatus === "ready" && stem.audioUrl;
          const isSoloDimmed = hasSolo && !ts.soloed;
          return (
            <div
              key={stem.id}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                isSoloDimmed
                  ? "border-gray-100 dark:border-gray-800 opacity-40"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {isReady && hasMultipleReady && (
                <audio
                  ref={(el) => { audioRefs.current[idx] = el; }}
                  src={stem.audioUrl ?? ""}
                  preload="auto"
                  onEnded={handleEnded}
                  onDurationChange={(e) => {
                    if (idx === 0) setDuration((e.target as HTMLAudioElement).duration);
                  }}
                  className="hidden"
                />
              )}

              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-900 dark:text-white block truncate">
                  {stem.title || `Stem ${idx + 1}`}
                </span>
              </div>

              {isReady ? (
                <>
                  {hasMultipleReady ? (
                    <>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={ts.volume}
                        onChange={(e) => handleVolume(idx, parseFloat(e.target.value))}
                        aria-label={`Volume for ${stem.title || "stem"}`}
                        className="w-16 h-1 accent-violet-500 cursor-pointer"
                      />
                      <button
                        onClick={() => toggleMute(idx)}
                        aria-label={ts.muted ? `Unmute ${stem.title || "stem"}` : `Mute ${stem.title || "stem"}`}
                        className={`p-1.5 rounded transition-colors ${
                          ts.muted
                            ? "text-red-500 bg-red-100 dark:bg-red-900/30"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        {ts.muted ? <SpeakerXMarkIcon className="w-4 h-4" /> : <SpeakerWaveIcon className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => toggleSolo(idx)}
                        aria-label={ts.soloed ? `Unsolo ${stem.title || "stem"}` : `Solo ${stem.title || "stem"}`}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                          ts.soloed
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        S
                      </button>
                    </>
                  ) : (
                    <audio src={stem.audioUrl ?? ""} controls preload="none" className="h-8 w-36" />
                  )}
                  <button
                    onClick={() => onDownload(stem)}
                    aria-label={`Download ${stem.title || "stem"}`}
                    className="p-1.5 text-gray-500 hover:text-violet-500 dark:text-gray-400 dark:hover:text-violet-400 transition-colors flex-shrink-0"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                </>
              ) : stem.generationStatus === "failed" ? (
                <span className="text-xs text-red-500">Failed</span>
              ) : (
                <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {hasMultipleReady && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label="Seek"
            className="w-full h-1 accent-violet-500 cursor-pointer"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              aria-label={isPlaying ? "Pause" : "Play all stems"}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors min-w-[72px] justify-center"
            >
              {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-xs text-gray-400 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
