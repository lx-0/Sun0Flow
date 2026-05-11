/**
 * Shared download primitives used by client-side download, batch export,
 * and server-side download preparation modules.
 */

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitizeForFilename(
  title: string | null | undefined,
  fallback = "song",
): string {
  return (
    (title ?? fallback)
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || fallback
  );
}

export function detectAudioFormat(audioUrl: string): "mp3" | "wav" {
  return audioUrl.toLowerCase().includes(".wav") ? "wav" : "mp3";
}
