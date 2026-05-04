import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { imageCache } from "@/lib/file-cache";
import { logger } from "@/lib/logger";

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
      select: { imageUrl: true, isPublic: true },
    });

    if (!song?.imageUrl) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buf = await imageCache.downloadAndPut(songId, song.imageUrl);
    if (!buf) {
      return NextResponse.redirect(song.imageUrl);
    }

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
  } catch (err) {
    logger.error({ err }, "image proxy: unhandled error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
