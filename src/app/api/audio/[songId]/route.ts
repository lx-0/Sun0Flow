import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { fetchFreshUrls } from "@/lib/sunoapi/refresh";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { getCachedAudio, cacheAudio, isCached } from "@/lib/audio-cache";
import { logger } from "@/lib/logger";

// Refresh audio URL when within 3 days of expiry (matches play endpoint threshold).
const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
// Conservative TTL after a successful refresh (12 days).
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

/**
 * Audio proxy — streams audio from the Suno origin through this endpoint.
 *
 * Serves from a local file cache when available so playback never depends on
 * Suno URL availability. On a cache miss the audio is fetched from Suno (with
 * automatic URL refresh when expired) and written through to the cache for
 * future requests.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { songId } = await params;

    // Ownership check
    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { audioUrl: true, audioUrlExpiresAt: true, sunoJobId: true, sunoAudioId: true },
    });

    if (!song?.audioUrl) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND", detail: { hasJobId: !!song?.sunoJobId } },
        { status: 404 }
      );
    }

    // ── Serve from local cache ────────────────────────────────────────────
    if (isCached(songId)) {
      return serveCached(songId, request.headers.get("range"));
    }

    // ── Cache miss — fetch from Suno ──────────────────────────────────────
    let audioUrl = song.audioUrl;
    let refreshed = false;
    const now = Date.now();

    // Helper: refresh URL from sunoapi.org (bypasses circuit breaker)
    const tryRefresh = async (): Promise<boolean> => {
      if (!song.sunoJobId) return false;
      try {
        const userApiKey = await resolveUserApiKey(userId);
        const fresh = await fetchFreshUrls(song.sunoJobId, userApiKey, song.sunoAudioId ?? undefined);
        if (fresh?.audioUrl) {
          await prisma.song.update({
            where: { id: songId },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(Date.now() + AUDIO_URL_TTL_MS),
              imageUrl: fresh.imageUrl || undefined,
            },
          });
          audioUrl = fresh.audioUrl;
          refreshed = true;
          return true;
        }
        logger.warn({ songId, sunoJobId: song.sunoJobId }, "audio proxy: refresh returned no audioUrl");
      } catch (err) {
        logger.warn({ songId, sunoJobId: song.sunoJobId, err }, "audio proxy: refresh failed");
      }
      return false;
    };

    // Pre-emptive refresh if URL is expired or near-expiry
    const isExpired =
      !song.audioUrlExpiresAt ||
      song.audioUrlExpiresAt.getTime() - now < REFRESH_THRESHOLD_MS;
    if (isExpired) {
      await tryRefresh();
    }

    // Fetch from Suno — full file (no Range) so we can cache the complete file
    let upstream: Response;
    try {
      upstream = await fetch(audioUrl);
    } catch (err) {
      logger.error({ songId, audioUrl, refreshed, err }, "audio proxy: fetch threw");
      return NextResponse.json(
        { error: "Failed to fetch audio from origin", code: "UPSTREAM_ERROR",
          detail: { refreshed, hasJobId: !!song.sunoJobId, urlExpired: isExpired } },
        { status: 502 }
      );
    }

    // If upstream failed and we haven't refreshed yet, force a refresh and retry
    if (!upstream.ok && !refreshed && song.sunoJobId) {
      logger.warn({ songId, status: upstream.status }, "audio proxy: upstream failed, forcing refresh");
      const didRefresh = await tryRefresh();
      if (didRefresh) {
        try {
          upstream = await fetch(audioUrl);
        } catch (err) {
          logger.error({ songId, audioUrl, err }, "audio proxy: retry fetch threw");
          return NextResponse.json(
            { error: "Failed to fetch audio after refresh", code: "UPSTREAM_ERROR",
              detail: { refreshed: true, hasJobId: true, urlExpired: isExpired } },
            { status: 502 }
          );
        }
      }
    }

    if (!upstream.ok) {
      logger.error({ songId, audioUrl, refreshed, status: upstream.status }, "audio proxy: upstream not ok");
      return NextResponse.json(
        { error: "Audio unavailable at origin", code: "UPSTREAM_ERROR",
          detail: { refreshed, upstreamStatus: upstream.status, hasJobId: !!song.sunoJobId, urlExpired: isExpired } },
        { status: 502 }
      );
    }

    // Read full body, cache to disk, then serve (including Range support)
    const arrayBuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    cacheAudio(songId, buf);

    return serveBuf(buf, request.headers.get("range"));
  } catch (err) {
    logger.error({ err }, "audio proxy: unhandled error");
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function serveCached(songId: string, rangeHeader: string | null): Response {
  const buf = getCachedAudio(songId);
  if (!buf) {
    // Race: cache file disappeared between check and read
    return NextResponse.json(
      { error: "Cache read failed", code: "CACHE_ERROR" },
      { status: 500 }
    );
  }
  return serveBuf(buf, rangeHeader);
}

function serveBuf(buf: Buffer, rangeHeader: string | null): Response {
  const headers = new Headers();
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : buf.length - 1;
      const slice = buf.subarray(start, end + 1);
      headers.set("Content-Length", String(slice.length));
      headers.set("Content-Range", `bytes ${start}-${end}/${buf.length}`);
      return new Response(new Uint8Array(slice), { status: 206, headers });
    }
  }

  headers.set("Content-Length", String(buf.length));
  return new Response(new Uint8Array(buf), { status: 200, headers });
}
