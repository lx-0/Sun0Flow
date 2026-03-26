"use client";

/**
 * DownloadButton — format/quality picker with progress tracking.
 *
 * Shows available download formats based on the song's native audio format:
 *   - MP3 source: MP3 options only (WAV/FLAC require conversion first)
 *   - WAV source: MP3 (native), WAV (native), FLAC (converted server-side)
 *
 * The last-used format preference is persisted in localStorage.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowDownTrayIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { downloadSongFile, detectFormat } from "@/lib/download";
import { estimateAudioBytes, formatBytes } from "@/lib/audio-metadata";
import type { AudioFormat, Mp3Quality, WavBitDepth } from "@/lib/audio-metadata";

export interface DownloadableSong {
  id: string;
  title: string | null | undefined;
  audioUrl: string;
  duration?: number | null;
  createdAt?: Date | string;
}

interface FormatOption {
  format: AudioFormat;
  quality: Mp3Quality | WavBitDepth | null;
  label: string;
  sublabel: string;
  sizeEstimate: string;
  available: boolean;
  unavailableReason?: string;
}

interface DownloadButtonProps {
  song: DownloadableSong;
  className?: string;
  compact?: boolean;
}

const PREF_KEY = "sunoflow:download-pref";

interface DownloadPref {
  format: AudioFormat;
  quality: Mp3Quality | WavBitDepth | null;
}

function loadPref(): DownloadPref | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as DownloadPref) : null;
  } catch {
    return null;
  }
}

function savePref(pref: DownloadPref): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    // ignore quota errors
  }
}

function buildFormatOptions(nativeFormat: "mp3" | "wav", duration: number): FormatOption[] {
  const isWav = nativeFormat === "wav";

  return [
    {
      format: "mp3",
      quality: 128 as Mp3Quality,
      label: "MP3",
      sublabel: "128 kbps · standard",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "mp3", 128)),
      available: true, // MP3 is always the native or fallback
    },
    {
      format: "mp3",
      quality: 256 as Mp3Quality,
      label: "MP3",
      sublabel: "256 kbps · high quality",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "mp3", 256)),
      available: true,
    },
    {
      format: "mp3",
      quality: 320 as Mp3Quality,
      label: "MP3",
      sublabel: "320 kbps · best quality",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "mp3", 320)),
      available: true,
    },
    {
      format: "wav",
      quality: 16 as WavBitDepth,
      label: "WAV",
      sublabel: "16-bit · lossless",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "wav", 16)),
      available: isWav,
      unavailableReason: isWav ? undefined : "Requires WAV conversion",
    },
    {
      format: "wav",
      quality: 24 as WavBitDepth,
      label: "WAV",
      sublabel: "24-bit · studio quality",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "wav", 24)),
      available: isWav,
      unavailableReason: isWav ? undefined : "Requires WAV conversion",
    },
    {
      format: "flac",
      quality: null,
      label: "FLAC",
      sublabel: "lossless compressed",
      sizeEstimate: formatBytes(estimateAudioBytes(duration, "flac")),
      available: isWav,
      unavailableReason: isWav ? undefined : "Requires WAV conversion",
    },
  ];
}

function defaultOption(
  options: FormatOption[],
  pref: DownloadPref | null
): FormatOption {
  if (pref) {
    const match = options.find(
      (o) => o.available && o.format === pref.format && o.quality === pref.quality
    );
    if (match) return match;
  }
  // Default: first available option
  return options.find((o) => o.available) ?? options[0];
}

export function DownloadButton({ song, className = "", compact = false }: DownloadButtonProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const nativeFormat = detectFormat(song.audioUrl);
  const duration = song.duration ?? 0;
  const formatOptions = buildFormatOptions(nativeFormat, duration);

  const [selected, setSelected] = useState<FormatOption>(() =>
    defaultOption(formatOptions, loadPref())
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const doDownload = useCallback(
    async (opt: FormatOption) => {
      if (progress !== null) return;
      setError(null);
      setOpen(false);
      setSelected(opt);
      savePref({ format: opt.format, quality: opt.quality });
      try {
        await downloadSongFile(song, setProgress, {
          format: opt.format,
          quality: opt.quality ?? undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed");
        setProgress(null);
      }
    },
    [song, progress]
  );

  const isDownloading = progress !== null;
  const availableOptions = formatOptions.filter((o) => o.available);
  const hasMultipleFormats = availableOptions.length > 1;

  const progressLabel = isDownloading
    ? progress === 100
      ? "Done"
      : `${progress}%`
    : null;

  if (!hasMultipleFormats) {
    const opt = availableOptions[0] ?? formatOptions[0];
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <button
          onClick={() => doDownload(opt)}
          disabled={isDownloading || !song.audioUrl || !opt.available}
          aria-label={isDownloading ? `Downloading ${progress}%` : "Download song"}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors
            ${isDownloading
              ? "cursor-wait bg-violet-700/60 text-violet-300"
              : "bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
            }`}
        >
          <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
          {!compact && (
            <span>
              {progressLabel ?? "Download"}
            </span>
          )}
          {!compact && !isDownloading && duration > 0 && opt.available && (
            <span className="text-violet-300 text-xs">· {opt.label} · ~{opt.sizeEstimate}</span>
          )}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {isDownloading && progress !== null && progress < 100 && (
          <div className="h-1 w-full rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col gap-1 ${className}`} ref={menuRef}>
      <div className="flex items-stretch">
        {/* Primary action: download with selected format */}
        <button
          onClick={() => doDownload(selected)}
          disabled={isDownloading || !song.audioUrl}
          aria-label={isDownloading ? `Downloading ${progress}%` : `Download as ${selected.label}`}
          className={`flex items-center gap-1.5 rounded-l-lg px-3 py-2 text-sm font-medium transition-colors
            ${isDownloading
              ? "cursor-wait bg-violet-700/60 text-violet-300"
              : "bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
            }`}
        >
          <ArrowDownTrayIcon className="w-4 h-4 shrink-0" />
          {!compact && (
            <span>
              {progressLabel ?? "Download"}
            </span>
          )}
          {!compact && !isDownloading && (
            <span className="text-violet-300 text-xs">
              · {selected.label}
              {selected.quality ? ` ${selected.quality}${selected.format === "mp3" ? " kbps" : "-bit"}` : ""}
              {duration > 0 ? ` · ~${selected.sizeEstimate}` : ""}
            </span>
          )}
        </button>

        {/* Chevron toggle for format picker */}
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={isDownloading}
          aria-label="Choose download format"
          aria-expanded={open}
          className="flex items-center justify-center rounded-r-lg px-1.5 py-2 bg-violet-700 hover:bg-violet-600
            text-white border-l border-violet-600 transition-colors disabled:opacity-50"
        >
          <ChevronDownIcon
            className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Format/quality dropdown */}
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-60 rounded-lg border border-gray-700
          bg-gray-900 shadow-xl py-1 text-sm">

          {/* Group by format */}
          {(["mp3", "wav", "flac"] as AudioFormat[]).map((fmt) => {
            const opts = formatOptions.filter((o) => o.format === fmt);
            if (opts.length === 0) return null;
            return (
              <div key={fmt}>
                <div className="px-3 pt-2 pb-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {fmt.toUpperCase()}
                </div>
                {opts.map((opt, i) => {
                  const isSelected =
                    selected.format === opt.format && selected.quality === opt.quality;
                  return (
                    <button
                      key={i}
                      onClick={() => opt.available ? doDownload(opt) : undefined}
                      disabled={!opt.available}
                      title={!opt.available ? opt.unavailableReason : undefined}
                      className={`w-full flex items-center justify-between px-3 py-2 transition-colors
                        ${opt.available
                          ? isSelected
                            ? "bg-violet-900/40 text-violet-300"
                            : "hover:bg-gray-800 text-white"
                          : "opacity-40 cursor-not-allowed text-gray-400"
                        }`}
                    >
                      <div className="flex flex-col items-start gap-0">
                        <span className="font-medium">{opt.sublabel}</span>
                        {!opt.available && opt.unavailableReason && (
                          <span className="text-xs text-gray-500">{opt.unavailableReason}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {duration > 0 && opt.available && (
                          <span className="text-gray-400 text-xs">~{opt.sizeEstimate}</span>
                        )}
                        {isSelected && (
                          <span className="text-violet-400 text-xs">✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
      {isDownloading && progress !== null && progress < 100 && (
        <div className="h-1 w-full rounded-full bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-violet-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
