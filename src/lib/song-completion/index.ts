import { invalidateByPrefix } from "@/lib/cache";
import { broadcast } from "@/lib/event-bus";
import { persistSongCompletion, createAlternateSongs, markQueueItemDone, markSongFailed } from "./persist";
import { cacheCompletionAssets } from "./cache-assets";
import { notifyCompletion } from "./notify";
import { trackCompletionActivity } from "./track-activity";
import type { CompletionSong, SongRecord } from "./types";

export type { CompletionSong, SongRecord } from "./types";

export async function handleSongSuccess(
  song: SongRecord,
  completionSongs: CompletionSong[],
): Promise<void> {
  if (completionSongs.length === 0) return;

  const firstSong = completionSongs[0];

  const updated = await persistSongCompletion(song, firstSong);
  const alternates = await createAlternateSongs(song, completionSongs);

  cacheCompletionAssets(song, firstSong, alternates);

  for (const alt of alternates) {
    broadcast(song.userId, {
      type: "generation_update",
      data: {
        songId: alt.id,
        parentSongId: alt.parentSongId,
        status: "ready",
        title: alt.title,
        audioUrl: alt.audioUrl,
        imageUrl: alt.imageUrl,
      },
    });
  }

  invalidateByPrefix(`dashboard-stats:${song.userId}`);
  broadcast(song.userId, {
    type: "generation_update",
    data: {
      songId: song.id,
      status: "ready",
      title: updated.title,
      audioUrl: updated.audioUrl,
      imageUrl: updated.imageUrl,
      alternateCount: alternates.length,
    },
  });

  trackCompletionActivity(song.userId, song.id);

  await markQueueItemDone(song.id);
  broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });

  await notifyCompletion(song.userId, updated);
}

export async function handleSongFailure(
  song: SongRecord,
  errorMessage: string,
): Promise<void> {
  await markSongFailed(song, errorMessage);
  broadcast(song.userId, {
    type: "generation_update",
    data: { songId: song.id, status: "failed", errorMessage },
  });
  broadcast(song.userId, { type: "queue_item_complete", data: { songId: song.id } });
}
