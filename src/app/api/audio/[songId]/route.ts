import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { getTaskStatus } from "@/lib/sunoapi/status";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";

// Refresh audio URL when within 3 days of expiry (matches play endpoint threshold).
const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
// Conservative TTL after a successful refresh (12 days).
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

/**
 * Audio proxy — streams audio from the Suno origin through this endpoint.
 *
 * Cache-Control: private — browser may cache, but CDN/shared caches must not.
 * This endpoint requires authentication and enforces per-user ownership; a
 * public CDN cache would allow any requester knowing the song ID to bypass
 * auth and retrieve another user's audio.
 *
 * When the stored Suno URL is expired or near-expiry, the proxy refreshes it
 * from the Suno API before proxying — preventing 502s for older songs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const { userId, error: authError } = await resolveUser(request);
    if (authError) return authError;

    const { songId } = await params;

    const song = await prisma.song.findFirst({
      where: { id: songId, userId },
      select: { audioUrl: true, audioUrlExpiresAt: true, sunoJobId: true },
    });

    if (!song?.audioUrl) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    let audioUrl = song.audioUrl;

    // Refresh the Suno URL if it's expired or near-expiry
    const now = Date.now();
    const isExpired =
      !song.audioUrlExpiresAt ||
      song.audioUrlExpiresAt.getTime() - now < REFRESH_THRESHOLD_MS;

    if (isExpired && song.sunoJobId) {
      try {
        const userApiKey = await resolveUserApiKey(userId);
        const taskResult = await getTaskStatus(song.sunoJobId, userApiKey);
        const fresh = taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
        if (fresh?.audioUrl) {
          await prisma.song.update({
            where: { id: songId },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(now + AUDIO_URL_TTL_MS),
              imageUrl: fresh.imageUrl || undefined,
            },
          });
          audioUrl = fresh.audioUrl;
        }
      } catch {
        // Refresh failed — continue with existing URL (may still work)
      }
    }

    // Forward Range header so browsers can seek within the audio stream
    const upstreamHeaders: Record<string, string> = {};
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      upstreamHeaders["Range"] = rangeHeader;
    }

    let upstream: Response;
    try {
      upstream = await fetch(audioUrl, { headers: upstreamHeaders });
    } catch {
      return NextResponse.json(
        { error: "Failed to fetch audio from origin", code: "UPSTREAM_ERROR" },
        { status: 502 }
      );
    }

    // Accept both 200 and 206 (partial content for range requests)
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: "Audio unavailable at origin", code: "UPSTREAM_ERROR" },
        { status: 502 }
      );
    }

    const responseHeaders = new Headers();

    // Preserve content-type from upstream (audio/mpeg, audio/wav, etc.)
    const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    responseHeaders.set("Content-Type", contentType);

    // Forward streaming/range headers so browsers can seek properly
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    const acceptRanges = upstream.headers.get("accept-ranges");
    responseHeaders.set("Accept-Ranges", acceptRanges ?? "bytes");

    // Private cache only — CDN must not cache authenticated user content
    responseHeaders.set("Cache-Control", "private, max-age=3600");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
