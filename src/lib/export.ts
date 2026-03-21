/**
 * Client-side library export: ZIP (audio files) and M3U (playlist).
 * JSZip is loaded lazily to avoid bloating the initial bundle.
 */

export interface ExportableSong {
  id: string;
  title: string | null | undefined;
  audioUrl: string;
  tags?: string | null;
  duration?: number | null;
  createdAt?: Date | string;
}

/** Build a safe filename from a song title. */
function safeName(title: string | null | undefined, index: number): string {
  const base = (title ?? `song-${index + 1}`)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || `song-${index + 1}`;
  return base;
}

function fileExtension(url: string): string {
  return url.toLowerCase().includes(".wav") ? "wav" : "mp3";
}

/**
 * Export songs as a ZIP archive containing audio files.
 * Calls `onProgress` with { completed, total } as each song is fetched.
 */
export async function exportAsZip(
  songs: ExportableSong[],
  onProgress: (completed: number, total: number) => void
): Promise<void> {
  const downloadable = songs.filter((s) => s.audioUrl);
  if (downloadable.length === 0) throw new Error("No songs with audio to export");

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < downloadable.length; i++) {
    const song = downloadable[i];
    const name = safeName(song.title, i);
    const ext = fileExtension(song.audioUrl);

    // Deduplicate filenames
    let finalName = `${name}.${ext}`;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${name}-${counter}.${ext}`;
      counter++;
    }
    usedNames.add(finalName);

    const res = await fetch(`/api/songs/${song.id}/download`);
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
  triggerDownload(content, "sunoflow-library.zip");
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
  triggerDownload(blob, "sunoflow-library.m3u");
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
