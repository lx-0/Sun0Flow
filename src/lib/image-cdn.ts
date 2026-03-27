/**
 * Image CDN utilities for SunoFlow.
 *
 * Cover art images are hosted on cdn.sunoapi.org and delivered directly from
 * that CDN. In React components, use <CoverArtImage> or Next.js <Image> for
 * automatic optimization (resize, format conversion to WebP/AVIF, lazy load).
 *
 * This module handles the URL-string use cases — metadata generation, JSON
 * responses, OG tags — where a component is not available. It also documents
 * the fallback chain so every call site behaves consistently.
 *
 * Audio assets use a different pattern (see audio-cdn.ts) because they require
 * per-user auth: they are routed through /api/audio/[songId] rather than
 * served directly from the CDN.
 */

/** Default cover image served when a song has no uploaded artwork. */
const DEFAULT_COVER = "/icons/icon-512.png";

/**
 * Returns the URL for a song's cover art.
 *
 * Use this when you need a raw URL string (e.g. in `generateMetadata`,
 * structured-data JSON, or RSS feeds). For React components, use
 * <CoverArtImage> or Next.js <Image> instead — they add automatic
 * size-based optimisation via the /_next/image endpoint.
 *
 * @param imageUrl - Raw image URL from the Suno API (may be null)
 * @param fallback - URL to use when imageUrl is absent (defaults to app icon)
 * @returns A non-null image URL
 */
export function coverArtUrl(
  imageUrl: string | null | undefined,
  fallback: string = DEFAULT_COVER
): string {
  return imageUrl ?? fallback;
}
