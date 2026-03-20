/**
 * Client-side song download utility with progress tracking.
 */

import type { SunoSong } from "@/lib/sunoapi";

/** Build a safe filename: `{song-title}-{YYYY-MM-DD}.mp3` (or .wav) */
function buildFilename(song: SunoSong): string {
  const title = song.title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "song";

  const date = new Date(song.createdAt).toISOString().slice(0, 10);
  const ext = song.audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";
  return `${title}-${date}.${ext}`;
}

/**
 * Fetch `song.audioUrl` with streaming progress, then trigger a browser download.
 * `onProgress` is called with 0–100 (percent). When content-length is unknown,
 * it is called once with 50 while fetching and 100 when done.
 */
export async function downloadSongFile(
  song: SunoSong,
  onProgress: (pct: number) => void
): Promise<void> {
  if (!song.audioUrl) throw new Error("No audio URL available");

  onProgress(0);

  const res = await fetch(song.audioUrl);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.statusText}`);
  }

  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: no streaming support — load as blob directly
    onProgress(50);
    const blob = await res.blob();
    onProgress(100);
    triggerDownload(blob, buildFilename(song));
    return;
  }

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      onProgress(Math.min(99, Math.round((received / total) * 100)));
    } else {
      // Unknown total — pulse at 50 until done
      onProgress(50);
    }
  }

  const mimeType = song.audioUrl.toLowerCase().includes(".wav")
    ? "audio/wav"
    : "audio/mpeg";
  const blob = new Blob(chunks, { type: mimeType });
  onProgress(100);
  triggerDownload(blob, buildFilename(song));
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
