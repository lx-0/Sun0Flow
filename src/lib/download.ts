/**
 * Client-side song download utility with progress tracking.
 */

export interface DownloadableSong {
  id: string;
  title: string | null | undefined;
  audioUrl: string;
  createdAt?: Date | string;
}

/**
 * Download a song via the server-side proxy endpoint.
 * The proxy handles auth, ownership, rate limiting, and hides external URLs.
 * `onProgress` is called with 0–100 (percent). When content-length is unknown,
 * it is called once with 50 while fetching and 100 when done.
 */
export async function downloadSongFile(
  song: DownloadableSong,
  onProgress: (pct: number) => void
): Promise<void> {
  if (!song.audioUrl) throw new Error("No audio URL available");

  onProgress(0);

  const res = await fetch(`/api/songs/${song.id}/download`);
  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Download rate limit exceeded. Try again later.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Download failed: ${res.statusText}`);
  }

  const contentLength = res.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: no streaming support — load as blob directly
    onProgress(50);
    const blob = await res.blob();
    onProgress(100);
    triggerDownload(blob, extractFilename(res) ?? buildFallbackFilename(song));
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

  const mimeType = res.headers.get("content-type") ?? "audio/mpeg";
  const blob = new Blob(chunks, { type: mimeType });
  onProgress(100);
  triggerDownload(blob, extractFilename(res) ?? buildFallbackFilename(song));
}

/** Extract filename from Content-Disposition header */
function extractFilename(res: Response): string | null {
  const cd = res.headers.get("content-disposition");
  if (!cd) return null;
  const match = cd.match(/filename="?([^";\n]+)"?/);
  return match?.[1] ?? null;
}

/** Fallback filename when Content-Disposition is missing */
function buildFallbackFilename(song: DownloadableSong): string {
  const title = (song.title ?? "song")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "song";
  const date = song.createdAt
    ? new Date(song.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const ext = song.audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";
  return `${title}-${date}.${ext}`;
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
