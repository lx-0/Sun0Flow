import { prisma } from "@/lib/prisma";

export async function recordActivity(params: {
  userId: string;
  type: "song_created" | "playlist_created" | "song_favorited";
  songId?: string;
  playlistId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.activity.create({
      data: {
        userId: params.userId,
        type: params.type,
        songId: params.songId ?? null,
        playlistId: params.playlistId ?? null,
        metadata: params.metadata ?? undefined,
      },
    });
  } catch {
    // Non-fatal — activity recording failure should not break the main flow
  }
}
