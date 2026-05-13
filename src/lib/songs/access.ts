import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { cacheKey, invalidateByPrefix, invalidateKey } from "@/lib/cache";
import { SongFilters } from "./filters";

export function invalidateSongDashboardCache(userId: string) {
  invalidateByPrefix(`dashboard-stats:${userId}`);
}

export function invalidatePublicSongCache(publicSlug: string | null) {
  if (!publicSlug) return;
  invalidateKey(cacheKey("public-song", publicSlug));
}

export function ensurePublicSlug(existingSlug: string | null): string {
  return existingSlug ?? randomBytes(6).toString("hex");
}

export async function findAccessibleSong(songId: string, userId: string) {
  return prisma.song.findFirst({
    where: {
      id: songId,
      OR: [{ userId }, { isPublic: true }],
    },
  });
}

export async function findOwnedSong(
  userId: string,
  songId: string,
  extraWhere: Record<string, unknown> = {},
) {
  return prisma.song.findFirst({
    where: { ...SongFilters.ownedBy(userId, songId), ...extraWhere },
  });
}
