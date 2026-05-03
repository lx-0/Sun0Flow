import { downloadAndCache, isCached } from "@/lib/audio-cache";
import { downloadAndCacheImage, hasCachedImage } from "@/lib/image-cache";
import type { CompletionSong, SongRecord, AlternateSong } from "./types";

export function cacheCompletionAssets(
  song: SongRecord,
  firstSong: CompletionSong,
  alternates: AlternateSong[],
): void {
  if (firstSong.audioUrl && !isCached(song.id)) {
    downloadAndCache(song.id, firstSong.audioUrl).catch(() => {});
  }
  const coverUrl = firstSong.imageUrl || song.imageUrl;
  if (coverUrl && !hasCachedImage(song.id)) {
    downloadAndCacheImage(song.id, coverUrl).catch(() => {});
  }

  for (const alt of alternates) {
    if (alt.audioSource.audioUrl) {
      downloadAndCache(alt.id, alt.audioSource.audioUrl).catch(() => {});
    }
    if (alt.audioSource.imageUrl) {
      downloadAndCacheImage(alt.id, alt.audioSource.imageUrl).catch(() => {});
    }
  }
}
