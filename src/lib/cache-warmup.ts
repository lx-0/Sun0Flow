import { prisma } from "@/lib/prisma";
import { downloadAndCache, isCached } from "@/lib/audio-cache";
import { getTaskStatus } from "@/lib/sunoapi/status";
import { resolveUserApiKey } from "@/lib/sunoapi/resolve-key";
import { logger } from "@/lib/logger";

const BATCH_SIZE = parseInt(process.env.CACHE_WARMUP_BATCH_SIZE || "100", 10);
const DELAY_MS = 1000;
const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;

export async function warmUpAudioCache(): Promise<void> {
  const songs = await prisma.song.findMany({
    where: {
      generationStatus: "ready",
      sunoJobId: { not: null },
    },
    orderBy: { playCount: "desc" },
    take: BATCH_SIZE,
    select: { id: true, sunoJobId: true, userId: true },
  });

  const userKeys = new Map<string, string | undefined>();
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (const song of songs) {
    if (isCached(song.id)) {
      skipped++;
      continue;
    }

    try {
      if (!userKeys.has(song.userId)) {
        userKeys.set(song.userId, await resolveUserApiKey(song.userId));
      }

      const taskResult = await getTaskStatus(song.sunoJobId!, userKeys.get(song.userId));
      const fresh = taskResult.songs.find((s) => s.audioUrl);
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
          ...(fresh.imageUrl
            ? { imageUrl: fresh.imageUrl, imageUrlExpiresAt: expiresAt }
            : {}),
        },
      });

      const result = await downloadAndCache(song.id, fresh.audioUrl);
      if (result) {
        cached++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await new Promise<void>((r) => setTimeout(r, DELAY_MS));
  }

  logger.info(
    { total: songs.length, cached, skipped, failed },
    "cache-warmup: complete"
  );
}
