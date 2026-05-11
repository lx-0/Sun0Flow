/**
 * Client-side library export: ZIP (audio files) and M3U (playlist).
 * JSZip is loaded lazily to avoid bloating the initial bundle.
 */

import type { AudioFormat, Mp3Quality, WavBitDepth } from "@/lib/audio-metadata";
import {
  triggerBrowserDownload,
  sanitizeForFilename,
  detectAudioFormat,
} from "@/lib/download-primitives";

export type { AudioFormat, Mp3Quality, WavBitDepth };

export interface ExportableSong {
  id: string;
  title: string | null | undefined;
  audioUrl: string;
  tags?: string | null;
  duration?: number | null;
  createdAt?: Date | string;
}

export interface ZipExportOptions {
  format?: AudioFormat | "native";
  quality?: Mp3Quality | WavBitDepth;
}

function resolveExtension(url: string, format?: AudioFormat | "native"): string {
  if (!format || format === "native") return detectAudioFormat(url);
  return format;
}

/**
 * Export songs as a ZIP archive containing audio files.
 * Calls `onProgress` with { completed, total } as each song is fetched.
 */
export async function exportAsZip(
  songs: ExportableSong[],
  onProgress: (completed: number, total: number) => void,
  options: ZipExportOptions = {}
): Promise<void> {
  const downloadable = songs.filter((s) => s.audioUrl);
  if (downloadable.length === 0) throw new Error("No songs with audio to export");

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < downloadable.length; i++) {
    const song = downloadable[i];
    const name = sanitizeForFilename(song.title, `song-${i + 1}`);
    const ext = resolveExtension(song.audioUrl, options.format);

    // Deduplicate filenames
    let finalName = `${name}.${ext}`;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${name}-${counter}.${ext}`;
      counter++;
    }
    usedNames.add(finalName);

    const qs = new URLSearchParams();
    if (options.format && options.format !== "native") qs.set("format", options.format);
    if (options.quality != null) qs.set("quality", String(options.quality));
    const url = `/api/songs/${song.id}/download${qs.toString() ? `?${qs}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) {
      // Skip failed downloads but continue
      onProgress(i + 1, downloadable.length);
      continue;
    }
    const blob = await res.blob();
    zip.file(finalName, blob);
    onProgress(i + 1, downloadable.length);
  }

  const content = await zip.generateAsync({ type: "blob" });
  triggerBrowserDownload(content, "sunoflow-library.zip");
}

/**
 * Export songs as an M3U playlist file.
 */
export function exportAsM3U(songs: ExportableSong[]): void {
  const downloadable = songs.filter((s) => s.audioUrl);
  if (downloadable.length === 0) throw new Error("No songs with audio to export");

  const lines: string[] = ["#EXTM3U"];

  for (const song of downloadable) {
    const duration = Math.round(song.duration ?? -1);
    const title = song.title ?? "Untitled";
    lines.push(`#EXTINF:${duration},${title}`);
    lines.push(song.audioUrl);
  }

  const blob = new Blob([lines.join("\n") + "\n"], { type: "audio/x-mpegurl" });
  triggerBrowserDownload(blob, "sunoflow-library.m3u");
}

