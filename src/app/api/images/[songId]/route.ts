import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageCache } from "@/lib/cache";
import { fetchFreshUrls } from "@/lib/sunoapi/refresh";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logger } from "@/lib/logger";

const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ songId: string }> },
) {
  try {
    const { songId } = await params;

    const cached = imageCache.get(songId);
    if (cached) {
      return new Response(new Uint8Array(cached.data), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Content-Length": String(cached.data.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { imageUrl: true, imageUrlIsCustom: true, isPublic: true, sunoJobId: true, sunoAudioId: true, userId: true },
    });

    if (!song?.imageUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buf = await imageCache.downloadAndPut(songId, song.imageUrl);
    if (buf) {
      const cachedNow = imageCache.get(songId);
      const contentType = cachedNow?.contentType ?? "image/jpeg";
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buf.length),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (song.sunoJobId && !song.imageUrlIsCustom) {
      try {
        const userApiKey = await resolveUserApiKey(song.userId);
        const fresh = await fetchFreshUrls(song.sunoJobId, userApiKey, song.sunoAudioId ?? undefined);
        if (fresh?.imageUrl) {
          await prisma.song.update({
            where: { id: songId },
            data: { imageUrl: fresh.imageUrl, imageUrlExpiresAt: new Date(Date.now() + CDN_URL_TTL_MS) },
          });
          const freshBuf = await imageCache.downloadAndPut(songId, fresh.imageUrl);
          if (freshBuf) {
            const ct = imageCache.get(songId)?.contentType ?? "image/jpeg";
            return new Response(new Uint8Array(freshBuf), {
              status: 200,
              headers: {
                "Content-Type": ct,
                "Content-Length": String(freshBuf.length),
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
          }
        }
      } catch (err) {
        logger.warn({ songId, err }, "image proxy: refresh attempt failed");
      }
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    logger.error({ err }, "image proxy: unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
