import type { Song } from "@prisma/client";

export interface QueueSongLike {
  id: string;
  title: string | null;
  audioUrl: string;
  imageUrl: string | null;
  duration: number | null;
  lyrics?: string | null;
}

export function songToQueueSong(song: Song): QueueSongLike | null {
  if (!song.audioUrl) return null;

  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl,
    duration: song.duration,
    lyrics: song.lyrics,
  };
}
