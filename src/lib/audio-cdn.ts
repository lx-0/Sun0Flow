/**
 * Returns the authenticated proxy URL for a song's audio asset.
 *
 * The `/api/audio/[songId]` route verifies ownership and streams audio from
 * the Suno origin. It sets `Cache-Control: private, max-age=3600` so the
 * browser can cache the audio for the session without a shared CDN cache
 * bypassing the per-user auth check.
 *
 * Range requests (for seeking) are forwarded to the origin so browsers can
 * load only the portion needed for playback.
 *
 * @param songId - The internal song ID (primary key in the songs table)
 * @returns A relative URL that resolves through the authenticated audio proxy
 */
export function proxiedAudioUrl(songId: string): string {
  return `/api/audio/${songId}`;
}
