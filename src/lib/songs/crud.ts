import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, invalidateKey, cacheKey } from "@/lib/cache";
import { sanitizeText } from "@/lib/sanitize";
import { type Result, success, Err } from "@/lib/result";
import { SongFilters } from "./index";

function invalidateUserSongs(userId: string) {
  invalidateByPrefix(`dashboard-stats:${userId}`);
}

export async function getSongRating(songId: string, userId: string) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
    select: { rating: true, ratingNote: true },
  });
  if (!song) return Err.notFound();
  return success({ rating: song.rating, ratingNote: song.ratingNote });
}

export async function updateSongRating(
  songId: string,
  userId: string,
  input: { stars: number; note?: string | null },
) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
  });
  if (!song) return Err.notFound();

  if (
    typeof input.stars !== "number" ||
    input.stars < 0 ||
    input.stars > 5 ||
    !Number.isInteger(input.stars)
  ) {
    return Err.validation("stars must be an integer 0-5");
  }

  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") {
      return Err.validation("note must be a string");
    }
    const trimmed = input.note.trim();
    if (trimmed.length > 500) {
      return Err.validation("note must be 500 characters or fewer");
    }
    note = trimmed || null;
  }

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: {
      rating: input.stars === 0 ? null : input.stars,
      ratingNote: input.stars === 0 ? null : note,
    },
  });

  invalidateUserSongs(userId);
  return success({ rating: updated.rating, ratingNote: updated.ratingNote });
}

export async function getSongLyrics(songId: string, userId: string) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
    select: { lyrics: true, lyricsEdited: true },
  });
  if (!song) return Err.notFound();
  return success({
    original: song.lyrics ?? null,
    edited: song.lyricsEdited ?? null,
  });
}

export async function updateSongLyrics(
  songId: string,
  userId: string,
  input: { edited?: string | null },
) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
  });
  if (!song) return Err.notFound();

  let edited: string | null = null;
  if (input.edited !== undefined && input.edited !== null) {
    const { value, error } = sanitizeText(input.edited, "lyrics");
    if (error) return Err.validation(error);
    edited = value || null;
  }

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: { lyricsEdited: edited },
    select: { lyrics: true, lyricsEdited: true },
  });

  return success({
    original: updated.lyrics ?? null,
    edited: updated.lyricsEdited ?? null,
  });
}

export async function updateSongVisibility(
  songId: string,
  userId: string,
  visibility: string,
): Promise<Result<{ visibility: string; isPublic: boolean; publicSlug: string | null }>> {
  if (visibility !== "public" && visibility !== "private") {
    return Err.validation("visibility must be 'public' or 'private'");
  }

  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
  });
  if (!song) return Err.notFound();

  const isPublic = visibility === "public";
  const data: Record<string, unknown> = { isPublic };
  if (isPublic && !song.publicSlug) {
    data.publicSlug = randomBytes(6).toString("hex");
  }

  const updated = await prisma.song.update({
    where: { id: song.id },
    data,
  });

  if (updated.publicSlug) {
    invalidateKey(cacheKey("public-song", updated.publicSlug));
  }

  return success({
    visibility: updated.isPublic ? "public" : "private",
    isPublic: updated.isPublic,
    publicSlug: updated.publicSlug,
  });
}

export async function toggleSongShare(songId: string, userId: string) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
  });
  if (!song) return Err.notFound();

  const newIsPublic = !song.isPublic;
  const publicSlug = newIsPublic
    ? song.publicSlug ?? randomBytes(6).toString("hex")
    : song.publicSlug;

  const updated = await prisma.song.update({
    where: { id: song.id },
    data: { isPublic: newIsPublic, publicSlug },
  });

  if (updated.publicSlug) {
    invalidateKey(cacheKey("public-song", updated.publicSlug));
  }

  return success({
    isPublic: updated.isPublic,
    publicSlug: updated.publicSlug,
  });
}

export async function archiveSong(songId: string, userId: string) {
  const song = await prisma.song.findFirst({
    where: SongFilters.ownedBy(userId, songId),
  });
  if (!song) return Err.notFound();

  if (song.archivedAt) {
    return Err.validation("Song is already archived");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: songId },
      data: { archivedAt: new Date(), isPublic: false },
    });

    const playlist = await tx.playlist.upsert({
      where: {
        userId_smartPlaylistType: {
          userId,
          smartPlaylistType: "archive",
        },
      },
      create: {
        name: "Archive",
        userId,
        isSmartPlaylist: true,
        smartPlaylistType: "archive",
      },
      update: {},
    });

    const lastSong = await tx.playlistSong.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { position: "desc" },
    });

    await tx.playlistSong.upsert({
      where: { playlistId_songId: { playlistId: playlist.id, songId } },
      create: {
        playlistId: playlist.id,
        songId,
        position: lastSong ? lastSong.position + 1 : 0,
        addedByUserId: userId,
      },
      update: {},
    });

    return updatedSong;
  });

  return success({ song: updated });
}

export async function restoreSong(songId: string, userId: string) {
  const song = await prisma.song.findFirst({
    where: { ...SongFilters.ownedBy(userId, songId), archivedAt: { not: null } },
  });
  if (!song) return Err.notFound();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedSong = await tx.song.update({
      where: { id: songId },
      data: { archivedAt: null },
    });

    await tx.playlistSong.deleteMany({
      where: {
        songId,
        playlist: { userId, smartPlaylistType: "archive" },
      },
    });

    return updatedSong;
  });

  return success({ song: updated });
}
