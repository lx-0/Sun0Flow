import { prisma } from "@/lib/prisma";

export async function recordActivity(params: {
  userId: string;
  type: "song_created" | "playlist_created" | "song_favorited" | "song_added_to_playlist" | "song_removed_from_playlist";
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
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    });
  } catch {
    // Non-fatal — activity recording failure should not break the main flow
  }
}
