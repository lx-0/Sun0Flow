"use client";

import { LyricsEditor } from "./LyricsEditor";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SongLyricsSectionProps {
  songId: string;
  lyrics?: string | null;
  lyricsEdited?: string | null;
  isCurrentSong: boolean;
}

// ─── SongLyricsSection ───────────────────────────────────────────────────────

export function SongLyricsSection({
  songId,
  lyrics,
  lyricsEdited,
  isCurrentSong,
}: SongLyricsSectionProps) {
  if (!lyrics && !lyricsEdited) return null;

  return (
    <LyricsEditor
      songId={songId}
      originalLyrics={lyrics ?? null}
      editedLyrics={lyricsEdited ?? null}
      isCurrentSong={isCurrentSong}
    />
  );
}
