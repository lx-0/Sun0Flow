import { audioCache, imageCache } from "@/lib/file-cache";
import type { CompletionSong, SongRecord, AlternateSong } from "./types";

export function cacheCompletionAssets(
  song: SongRecord,
  firstSong: CompletionSong,
  alternates: AlternateSong[],
): void {
  if (firstSong.audioUrl && !audioCache.has(song.id)) {
    audioCache.downloadAndPut(song.id, firstSong.audioUrl).catch(() => {});
  }
  const coverUrl = firstSong.imageUrl || song.imageUrl;
  if (coverUrl && !imageCache.has(song.id)) {
    imageCache.downloadAndPut(song.id, coverUrl).catch(() => {});
  }

  for (const alt of alternates) {
    if (alt.audioSource.audioUrl) {
      audioCache.downloadAndPut(alt.id, alt.audioSource.audioUrl).catch(() => {});
    }
    if (alt.audioSource.imageUrl) {
      imageCache.downloadAndPut(alt.id, alt.audioSource.imageUrl).catch(() => {});
    }
  }
}
