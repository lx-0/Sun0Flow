import { prisma } from "@/lib/prisma";
import { audioCache, imageCache } from "./file";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { fetchFreshUrls } from "@/lib/sunoapi/refresh";
import { logger } from "@/lib/logger";

const BATCH_SIZE = process.env.CACHE_WARMUP_BATCH_SIZE
  ? parseInt(process.env.CACHE_WARMUP_BATCH_SIZE, 10)
  : undefined;
const DELAY_MS = 1000;
const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export async function warmUpAudioCache(): Promise<void> {
  const songs = await prisma.song.findMany({
    where: {
      generationStatus: "ready",
      sunoJobId: { not: null },
    },
    orderBy: { playCount: "desc" },
    ...(BATCH_SIZE ? { take: BATCH_SIZE } : {}),
    select: { id: true, sunoJobId: true, sunoAudioId: true, userId: true, imageUrl: true, imageUrlIsCustom: true },
  });

  const userKeys = new Map<string, string | undefined>();
  let audioCached = 0;
  let audioSkipped = 0;
  let imageCached = 0;
  let imageSkipped = 0;
  let failed = 0;

  for (const song of songs) {
    const audioHit = audioCache.has(song.id);
    const imageHit = imageCache.has(song.id);

    if (audioHit) audioSkipped++;
    if (imageHit) imageSkipped++;

    if (audioHit && imageHit) continue;

    try {
      if (!userKeys.has(song.userId)) {
        userKeys.set(song.userId, await resolveUserApiKey(song.userId));
      }

      const fresh = await fetchFreshUrls(
        song.sunoJobId!,
        userKeys.get(song.userId),
        song.sunoAudioId ?? undefined
      );
      if (!fresh?.audioUrl) {
        failed++;
        continue;
      }

      const expiresAt = new Date(Date.now() + CDN_URL_TTL_MS);
      await prisma.song.update({
        where: { id: song.id },
        data: {
          audioUrl: fresh.audioUrl,
          audioUrlExpiresAt: expiresAt,
          ...(fresh.imageUrl && !song.imageUrlIsCustom
            ? { imageUrl: fresh.imageUrl, imageUrlExpiresAt: expiresAt }
            : {}),
        },
      });

      if (!audioHit) {
        const result = await audioCache.downloadAndPut(song.id, fresh.audioUrl);
        if (result) audioCached++;
        else failed++;
      }

      const coverUrl = fresh.imageUrl || song.imageUrl;
      if (!imageHit && coverUrl) {
        const result = await imageCache.downloadAndPut(song.id, coverUrl);
        if (result) imageCached++;
      }
    } catch (err) {
      failed++;
      logger.warn({ songId: song.id, err }, "cache-warmup: song failed");
    }

    await new Promise<void>((r) => setTimeout(r, DELAY_MS));
  }

  logger.info(
    { total: songs.length, audioCached, audioSkipped, imageCached, imageSkipped, failed },
    "cache-warmup: complete"
  );
}
