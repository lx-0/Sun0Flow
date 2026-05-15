import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchFreshUrls } from "@/lib/sunoapi";
import { audioCache, imageCache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const AUDIO_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export interface AudioProxyParams {
  songId: string;
  audioUrl: string;
  audioUrlExpiresAt: Date | null;
  sunoJobId: string | null;
  sunoAudioId: string | null;
  resolveApiKey: () => Promise<string | undefined>;
  rangeHeader: string | null;
  cacheControl: "public" | "private";
}

export async function proxyAudio(params: AudioProxyParams): Promise<Response> {
  const {
    songId,
    audioUrlExpiresAt,
    sunoJobId,
    sunoAudioId,
    resolveApiKey,
    rangeHeader,
    cacheControl,
  } = params;

  if (audioCache.has(songId)) {
    return serveCached(songId, rangeHeader, cacheControl);
  }

  let audioUrl = params.audioUrl;
  let refreshed = false;
  const now = Date.now();

  const tryRefresh = async (): Promise<boolean> => {
    if (!sunoJobId) return false;
    try {
      const apiKey = await resolveApiKey();
      const fresh = await fetchFreshUrls(
        sunoJobId,
        apiKey,
        sunoAudioId ?? undefined,
      );
      if (fresh?.audioUrl) {
        await prisma.song.update({
          where: { id: songId },
          data: {
            audioUrl: fresh.audioUrl,
            audioUrlExpiresAt: new Date(Date.now() + AUDIO_URL_TTL_MS),
            imageUrl: fresh.imageUrl || undefined,
          },
        });
        if (fresh.imageUrl && !imageCache.has(songId)) {
          imageCache.downloadAndPut(songId, fresh.imageUrl).catch(() => {});
        }
        audioUrl = fresh.audioUrl;
        refreshed = true;
        return true;
      }
      logger.warn(
        { songId, sunoJobId },
        "audio proxy: refresh returned no audioUrl",
      );
    } catch (err) {
      logger.warn({ songId, sunoJobId, err }, "audio proxy: refresh failed");
    }
    return false;
  };

  const isExpired =
    !audioUrlExpiresAt ||
    audioUrlExpiresAt.getTime() - now < REFRESH_THRESHOLD_MS;
  if (isExpired) {
    await tryRefresh();
  }

  let upstream: Response;
  try {
    upstream = await fetch(audioUrl);
  } catch (err) {
    logger.error({ songId, audioUrl, refreshed, err }, "audio proxy: fetch threw");
    return NextResponse.json(
      {
        error: "Failed to fetch audio from origin",
        code: "UPSTREAM_ERROR",
        detail: { refreshed, hasJobId: !!sunoJobId, urlExpired: isExpired },
      },
      { status: 502 },
    );
  }

  if (!upstream.ok && !refreshed && sunoJobId) {
    logger.warn(
      { songId, status: upstream.status },
      "audio proxy: upstream failed, forcing refresh",
    );
    const didRefresh = await tryRefresh();
    if (didRefresh) {
      try {
        upstream = await fetch(audioUrl);
      } catch (err) {
        logger.error({ songId, audioUrl, err }, "audio proxy: retry fetch threw");
        return NextResponse.json(
          {
            error: "Failed to fetch audio after refresh",
            code: "UPSTREAM_ERROR",
            detail: { refreshed: true, hasJobId: true, urlExpired: isExpired },
          },
          { status: 502 },
        );
      }
    }
  }

  if (!upstream.ok) {
    logger.error(
      { songId, audioUrl, refreshed, status: upstream.status },
      "audio proxy: upstream not ok",
    );
    return NextResponse.json(
      {
        error: "Audio unavailable at origin",
        code: "UPSTREAM_ERROR",
        detail: {
          refreshed,
          upstreamStatus: upstream.status,
          hasJobId: !!sunoJobId,
          urlExpired: isExpired,
        },
      },
      { status: 502 },
    );
  }

  const arrayBuf = await upstream.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  audioCache.put(songId, buf);

  return serveBuf(buf, rangeHeader, cacheControl);
}

function serveCached(
  songId: string,
  rangeHeader: string | null,
  cacheControl: "public" | "private",
): Response {
  const buf = audioCache.get(songId)?.data ?? null;
  if (!buf) {
    return NextResponse.json(
      { error: "Cache read failed", code: "CACHE_ERROR" },
      { status: 500 },
    );
  }
  return serveBuf(buf, rangeHeader, cacheControl);
}

function serveBuf(
  buf: Buffer,
  rangeHeader: string | null,
  cacheControl: "public" | "private",
): Response {
  const headers = new Headers();
  headers.set("Content-Type", "audio/mpeg");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", `${cacheControl}, max-age=3600`);

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
