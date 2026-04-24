import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { requireAdmin, logAdminAction } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const AUDIO_CACHE_DIR = process.env.AUDIO_CACHE_DIR || join(process.cwd(), ".audio-cache");
const IMAGE_CACHE_DIR = process.env.IMAGE_CACHE_DIR || join(process.cwd(), ".image-cache");

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function scanCacheDir(dir: string, extensions: string[]): { files: Set<string>; totalBytes: number } {
  const files = new Set<string>();
  let totalBytes = 0;

  if (!existsSync(dir)) {
    return { files, totalBytes };
  }

  for (const entry of readdirSync(dir)) {
    const ext = entry.slice(entry.lastIndexOf("."));
    if (!extensions.includes(ext)) continue;
    const name = entry.slice(0, entry.lastIndexOf("."));
    files.add(name);
    try {
      totalBytes += statSync(join(dir, entry)).size;
    } catch {
      // file may have been removed between readdir and stat
    }
  }

  return { files, totalBytes };
}

export async function GET() {
  const { error, user } = await requireAdmin();
  if (error) return error;

  const songs = await prisma.song.findMany({
    select: { id: true, title: true },
  });
  const totalSongs = songs.length;

  const audio = scanCacheDir(AUDIO_CACHE_DIR, [".mp3"]);
  const images = scanCacheDir(IMAGE_CACHE_DIR, [".jpg", ".png", ".webp"]);

  const audioMissing = songs.filter((s) => !audio.files.has(s.id));
  const imageMissing = songs.filter((s) => !images.files.has(s.id));

  const audioCached = totalSongs - audioMissing.length;
  const imagesCached = totalSongs - imageMissing.length;

  const missingItems = (items: typeof audioMissing) =>
    items.map((s) => ({ id: s.id, title: s.title ?? "Untitled" }));

  const audioPercent = totalSongs > 0 ? Math.round((audioCached / totalSongs) * 1000) / 10 : 100;
  const coversPercent = totalSongs > 0 ? Math.round((imagesCached / totalSongs) * 1000) / 10 : 100;

  const totalBytes = audio.totalBytes + images.totalBytes;
  const overallHealthPercent =
    totalSongs > 0
      ? Math.round(((audioCached + imagesCached) / (totalSongs * 2)) * 1000) / 10
      : 100;

  await logAdminAction(user!.id, "mirror_health_check", undefined, `${totalSongs} songs, ${audioPercent}% audio, ${coversPercent}% covers`);

  return NextResponse.json({
    totalSongs,
    audio: {
      cached: audioCached,
      missing: audioMissing.length,
      percentage: audioPercent,
      missingSongs: missingItems(audioMissing),
    },
    covers: {
      cached: imagesCached,
      missing: imageMissing.length,
      percentage: coversPercent,
      missingSongs: missingItems(imageMissing),
    },
    diskUsage: {
      audioBytes: audio.totalBytes,
      coverBytes: images.totalBytes,
      totalBytes,
      formatted: formatBytes(totalBytes),
    },
    overallHealthPercent,
    lastCheckedAt: new Date().toISOString(),
  });
}
