import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFreshUrls } from "@/lib/sunoapi/refresh";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { audioCache } from "@/lib/file-cache";
import { logger } from "@/lib/logger";

const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

/**
 * Public audio proxy — streams audio for public songs without authentication.
 * Only serves songs where isPublic=true and not hidden/archived.
 * Handles expired CDN URLs by refreshing via the song owner's API key.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  try {
    const { songId } = await params;

    const song = await prisma.song.findFirst({
      where: { id: songId, isPublic: true, isHidden: false, archivedAt: null },
      select: {
        audioUrl: true,
        audioUrlExpiresAt: true,
        sunoJobId: true,
        sunoAudioId: true,
        userId: true,
      },
    });

    if (!song?.audioUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (audioCache.has(songId)) {
      return serveCached(songId, request.headers.get("range"));
    }

    let audioUrl = song.audioUrl;
    const now = Date.now();
    const isExpired =
      !song.audioUrlExpiresAt ||
      song.audioUrlExpiresAt.getTime() - now < REFRESH_THRESHOLD_MS;

    if (isExpired && song.sunoJobId) {
      try {
        const ownerApiKey = await resolveUserApiKey(song.userId);
        const fresh = await fetchFreshUrls(song.sunoJobId, ownerApiKey, song.sunoAudioId ?? undefined);
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
        }
      } catch (err) {
        logger.warn({ songId, err }, "public audio proxy: refresh failed");
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(audioUrl);
    } catch (err) {
      logger.error({ songId, err }, "public audio proxy: fetch threw");
      return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
    }

    if (!upstream.ok && song.sunoJobId) {
      try {
        const ownerApiKey = await resolveUserApiKey(song.userId);
        const fresh = await fetchFreshUrls(song.sunoJobId, ownerApiKey, song.sunoAudioId ?? undefined);
        if (fresh?.audioUrl) {
          await prisma.song.update({
            where: { id: songId },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(Date.now() + AUDIO_URL_TTL_MS),
            },
          });
          upstream = await fetch(fresh.audioUrl);
        }
      } catch (err) {
        logger.warn({ songId, err }, "public audio proxy: retry refresh failed");
      }
    }

    if (!upstream.ok) {
      logger.error({ songId, status: upstream.status }, "public audio proxy: upstream not ok");
      return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
    }

    const arrayBuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    audioCache.put(songId, buf);

    return serveBuf(buf, request.headers.get("range"));
  } catch (err) {
    logger.error({ err }, "public audio proxy: unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function serveCached(songId: string, rangeHeader: string | null): Response {
  const buf = audioCache.get(songId)?.data ?? null;
  if (!buf) {
    return NextResponse.json({ error: "Cache read failed" }, { status: 500 });
  }
  return serveBuf(buf, rangeHeader);
}

function serveBuf(buf: Buffer, rangeHeader: string | null): Response {
  const headers = new Headers();
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=3600");

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
