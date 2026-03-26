"use client";

import { useEffect, useRef, useState } from "react";
import { proxiedAudioUrl } from "@/lib/audio-cdn";

// ─── Waveform generation ──────────────────────────────────────────────────────

const NUM_BARS = 200;

/** Module-level cache: songId → normalised peak amplitudes */
const peaksCache = new Map<string, Float32Array>();

async function computePeaks(songId: string): Promise<Float32Array> {
  const url = proxiedAudioUrl(songId);
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close();
  }

  const raw = decoded.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(raw.length / NUM_BARS));
  const peaks = new Float32Array(NUM_BARS);

  for (let i = 0; i < NUM_BARS; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, raw.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(raw[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  // Normalise so tallest bar fills the full height
  let maxVal = 0.01;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] > maxVal) maxVal = peaks[i];
  }
  for (let i = 0; i < peaks.length; i++) peaks[i] /= maxVal;

  return peaks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return "--:--";
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface PlayerWaveformProps {
  songId: string;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  onSeek: (fraction: number) => void;
  reactionTimestamps?: number[];
  commentTimestamps?: number[];
}

export function PlayerWaveform({
  songId,
  currentTime,
  duration,
  isBuffering,
  onSeek,
  reactionTimestamps,
  commentTimestamps,
}: PlayerWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const rafRef = useRef<number>(0);

  // Mirror mutable values into refs so the RAF loop sees the latest without
  // needing to be restarted on every render.
  const peaksRef = useRef<Float32Array | null>(null);
  const ctRef = useRef(currentTime);
  const durRef = useRef(duration);
  const bufRef = useRef(isBuffering);
  const reactionsRef = useRef<number[]>([]);
  const commentsRef = useRef<number[]>([]);
  ctRef.current = currentTime;
  durRef.current = duration;
  bufRef.current = isBuffering;
  reactionsRef.current = reactionTimestamps ?? [];
  commentsRef.current = commentTimestamps ?? [];

  const [peaks, setPeaks] = useState<Float32Array | null>(
    () => peaksCache.get(songId) ?? null
  );
  peaksRef.current = peaks;

  const [tooltip, setTooltip] = useState<{ x: number; time: number } | null>(
    null
  );

  // ─── Load peaks lazily when song changes ────────────────────────────────────
  useEffect(() => {
    if (peaksCache.has(songId)) {
      setPeaks(peaksCache.get(songId)!);
      return;
    }
    setPeaks(null);
    let cancelled = false;
    computePeaks(songId)
      .then((p) => {
        if (!cancelled) {
          peaksCache.set(songId, p);
          setPeaks(p);
        }
      })
      .catch(() => {
        /* silently fall back to placeholder bars */
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  // ─── RAF draw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Resize canvas to match CSS dimensions at device pixel ratio
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const physW = Math.round(cssW * dpr);
      const physH = Math.round(cssH * dpr);
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW;
        canvas.height = physH;
      }

      ctx.clearRect(0, 0, physW, physH);
      ctx.save();
      ctx.scale(dpr, dpr);

      const w = cssW;
      const h = cssH;
      const p = peaksRef.current;
      const progress =
        durRef.current > 0 ? ctRef.current / durRef.current : 0;
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark");

      // Colours
      const playedColor = "#7c3aed"; // violet-700
      const unplayedColor = isDark ? "#374151" : "#9ca3af"; // gray-700 / gray-400

      const barW = Math.max(1, (w - (NUM_BARS - 1)) / NUM_BARS);
      const step = w / NUM_BARS;

      for (let i = 0; i < NUM_BARS; i++) {
        // Use placeholder amplitude (0.3) while peaks are loading
        const amp = p ? p[i] : 0.3;
        const barH = Math.max(2, amp * h * 0.85);
        const x = i * step;
        const y = (h - barH) / 2;

        ctx.fillStyle = i / NUM_BARS < progress ? playedColor : unplayedColor;
        ctx.beginPath();
        // roundRect is widely supported in modern browsers; fall back to rect
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barW, barH, 1);
        } else {
          ctx.rect(x, y, barW, barH);
        }
        ctx.fill();
      }

      // Subtle buffering pulse overlay on the played region
      if (bufRef.current && progress > 0) {
        ctx.fillStyle = "rgba(124, 58, 237, 0.25)";
        ctx.fillRect(0, 0, progress * w, h);
      }

      // Reaction timestamp markers — amber pip at the bottom of each marked bar
      const reactionTs = reactionsRef.current;
      if (reactionTs.length > 0 && durRef.current > 0) {
        ctx.fillStyle = "#f59e0b"; // amber-500
        for (const ts of reactionTs) {
          const barIdx = Math.min(
            NUM_BARS - 1,
            Math.max(0, Math.floor((ts / durRef.current) * NUM_BARS))
          );
          const x = barIdx * step + barW / 2;
          ctx.beginPath();
          ctx.arc(x, h - 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Comment timestamp markers — violet pip at the top of each marked bar
      const commentTs = commentsRef.current;
      if (commentTs.length > 0 && durRef.current > 0) {
        ctx.fillStyle = "#a78bfa"; // violet-400
        for (const ts of commentTs) {
          const barIdx = Math.min(
            NUM_BARS - 1,
            Math.max(0, Math.floor((ts / durRef.current) * NUM_BARS))
          );
          const x = barIdx * step + barW / 2;
          ctx.beginPath();
          ctx.arc(x, 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    const loop = () => {
      paint();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // runs once; reads state via refs

  // ─── Pointer helpers ────────────────────────────────────────────────────────

  const getFrac = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  return (
    <div className="relative w-full h-full select-none">
      {/* Visually hidden range input for keyboard/screen reader seek access */}
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={duration > 0 ? Math.round((currentTime / duration) * 1000) : 0}
        onChange={(e) => onSeek(Number(e.target.value) / 1000)}
        aria-label={`Seek. ${fmtTime(currentTime)} of ${fmtTime(duration)}`}
        className="sr-only"
      />
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-pointer"
        aria-hidden="true"
        onMouseDown={(e) => {
          dragging.current = true;
          onSeek(getFrac(e));
        }}
        onMouseMove={(e) => {
          if (dragging.current) onSeek(getFrac(e));
          const r = e.currentTarget.getBoundingClientRect();
          setTooltip({
            x: e.clientX - r.left,
            time: getFrac(e) * duration,
          });
        }}
        onMouseUp={() => {
          dragging.current = false;
        }}
        onMouseLeave={() => {
          dragging.current = false;
          setTooltip(null);
        }}
      />

      {tooltip && (
        <div
          className="pointer-events-none absolute -top-6 bg-gray-900 dark:bg-gray-700 border border-gray-700 dark:border-gray-600 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap z-10"
          style={{ left: tooltip.x, transform: "translateX(-50%)" }}
        >
          {fmtTime(tooltip.time)}
        </div>
      )}
    </div>
  );
}
