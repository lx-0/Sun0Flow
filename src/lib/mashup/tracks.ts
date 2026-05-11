import { prisma } from "@/lib/prisma";
import { uploadFileBase64, uploadFileFromUrl, getTaskStatus } from "@/lib/sunoapi";

const EXPIRY_BUFFER_MS = 60 * 60 * 1000;
const MAX_BASE64_SIZE = 10 * 1024 * 1024;

export interface TrackSource {
  base64Data?: string;
  fileUrl?: string;
  songId?: string;
}

export async function resolveTrackUrl(
  track: TrackSource,
  userId: string,
  apiKey: string | undefined,
): Promise<string> {
  if (track.songId) {
    return resolveFromLibrary(track.songId, userId, apiKey);
  }

  if (track.base64Data) {
    return resolveFromBase64(track.base64Data, apiKey);
  }

  if (track.fileUrl) {
    const result = await uploadFileFromUrl(track.fileUrl, apiKey);
    return result.fileUrl;
  }

  throw new Error("Track must have a file, URL, or library song");
}

async function resolveFromLibrary(
  songId: string,
  userId: string,
  apiKey: string | undefined,
): Promise<string> {
  const song = await prisma.song.findFirst({
    where: { id: songId, userId },
    select: { audioUrl: true, audioUrlExpiresAt: true, sunoJobId: true },
  });
  if (!song?.audioUrl) {
    throw new Error("Selected song has no audio URL");
  }

  let audioUrl = song.audioUrl;
  const isExpiredOrSoon =
    !song.audioUrlExpiresAt ||
    song.audioUrlExpiresAt.getTime() - Date.now() < EXPIRY_BUFFER_MS;

  if (isExpiredOrSoon && song.sunoJobId) {
    try {
      const taskResult = await getTaskStatus(song.sunoJobId, apiKey);
      const fresh =
        taskResult.songs.find((s) => s.audioUrl) ?? taskResult.songs[0];
      if (fresh?.audioUrl) {
        audioUrl = fresh.audioUrl;
        prisma.song
          .update({
            where: { id: songId },
            data: {
              audioUrl: fresh.audioUrl,
              audioUrlExpiresAt: new Date(
                Date.now() + 12 * 24 * 60 * 60 * 1000,
              ),
            },
          })
          .catch(() => {});
      }
    } catch {
      // Refresh failed — try with existing URL
    }
  }

  const result = await uploadFileFromUrl(audioUrl, apiKey);
  return result.fileUrl;
}

async function resolveFromBase64(
  base64Data: string,
  apiKey: string | undefined,
): Promise<string> {
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  if (sizeBytes > MAX_BASE64_SIZE) {
    throw new Error("File too large for upload (max 10MB). Use a URL instead.");
  }
  const result = await uploadFileBase64(base64Data, apiKey);
  return result.fileUrl;
}
