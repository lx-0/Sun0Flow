import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-resolver";
import { prisma } from "@/lib/prisma";
import { downloadAndCacheImage, hasCachedImage, cachedImageCount } from "@/lib/image-cache";
import { logger } from "@/lib/logger";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;

  const songs = await prisma.song.findMany({
    where: {
      imageUrl: { not: null },
      generationStatus: "ready",
    },
    select: { id: true, imageUrl: true },
  });

  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (const song of songs) {
    if (!song.imageUrl) continue;

    if (hasCachedImage(song.id)) {
      skipped++;
      continue;
    }

    const buf = await downloadAndCacheImage(song.id, song.imageUrl);
    if (buf) {
      cached++;
    } else {
      failed++;
      logger.warn({ songId: song.id, imageUrl: song.imageUrl }, "backfill: failed to cache image");
    }
  }

  return NextResponse.json({
    total: songs.length,
    cached,
    skipped,
    failed,
    totalCached: cachedImageCount(),
  });
}
