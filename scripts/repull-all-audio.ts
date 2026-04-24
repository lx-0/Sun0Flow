/**
 * One-time script: re-pull all songs from sunoapi.org and cache audio locally.
 *
 * Run with:
 *   npx tsx scripts/repull-all-audio.ts
 *
 * Requires:
 *   - DATABASE_URL or SUNOFLOW_DATABASE_URL env var
 *   - SUNOAPI_KEY env var
 *   - AUDIO_CACHE_DIR env var (defaults to .audio-cache)
 */

import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

const SUNO_API_BASE = "https://api.sunoapi.org/api/v1";
const SYSTEM_API_KEY = process.env.SUNOAPI_KEY ?? "";
const CACHE_DIR =
  process.env.AUDIO_CACHE_DIR || join(process.cwd(), ".audio-cache");
const CDN_URL_TTL_MS = 12 * 24 * 60 * 60 * 1000;
const DELAY_MS = 1000;

function cachePath(songId: string): string {
  const safe = songId.replace(/[^a-zA-Z0-9_-]/g, "");
  return join(CACHE_DIR, `${safe}.mp3`);
}

function isCached(songId: string): boolean {
  return existsSync(cachePath(songId));
}

async function fetchFreshUrls(
  taskId: string,
  apiKey?: string
): Promise<{ audioUrl?: string; imageUrl?: string } | null> {
  const key = apiKey || SYSTEM_API_KEY;
  if (!key) throw new Error("No API key available");

  const res = await fetch(
    `${SUNO_API_BASE}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (!res.ok) throw new Error(`API returned ${res.status}`);

  const json = (await res.json()) as {
    data?: { response?: { sunoData?: Record<string, unknown>[] } };
  };
  const clips = json.data?.response?.sunoData ?? [];
  const match = clips.find(
    (c) => typeof c.audio_url === "string" && c.audio_url
  );
  if (!match) return null;

  return {
    audioUrl: match.audio_url as string,
    imageUrl: (match.image_url as string) || undefined,
  };
}

async function downloadToCache(
  songId: string,
  audioUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(cachePath(songId), buf);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!SYSTEM_API_KEY) {
    console.error("SUNOAPI_KEY env var is required.");
    process.exit(1);
  }

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  const songs = await prisma.song.findMany({
    where: { generationStatus: { in: ["ready", "completed", "complete"] }, sunoJobId: { not: null } },
    orderBy: { playCount: "desc" },
    select: { id: true, sunoJobId: true, userId: true },
  });

  console.log(`Found ${songs.length} songs with sunoJobId. Cache dir: ${CACHE_DIR}`);

  const userKeys = new Map<string, string | undefined>();
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(songs.map((s) => s.userId))] } },
    select: { id: true, sunoApiKey: true },
  });
  for (const u of users) userKeys.set(u.id, u.sunoApiKey ?? undefined);

  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];

    if (isCached(song.id)) {
      skipped++;
      process.stdout.write(
        `\r[${i + 1}/${songs.length}] cached:${cached} skipped:${skipped} failed:${failed}`
      );
      continue;
    }

    try {
      const fresh = await fetchFreshUrls(
        song.sunoJobId!,
        userKeys.get(song.userId)
      );
      if (!fresh?.audioUrl) {
        failed++;
        process.stdout.write(
          `\r[${i + 1}/${songs.length}] cached:${cached} skipped:${skipped} failed:${failed}`
        );
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

      const ok = await downloadToCache(song.id, fresh.audioUrl);
      if (ok) cached++;
      else failed++;
    } catch {
      failed++;
    }

    process.stdout.write(
      `\r[${i + 1}/${songs.length}] cached:${cached} skipped:${skipped} failed:${failed}`
    );
    await new Promise<void>((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nDone. cached:${cached} skipped:${skipped} failed:${failed} total:${songs.length}`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
