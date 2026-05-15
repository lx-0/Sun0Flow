import type { Song } from "@prisma/client";
import type { VariationRow } from "@/lib/songs/variations/types";

export const VARIATION_SELECT = {
  id: true,
  title: true,
  prompt: true,
  tags: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
  lyrics: true,
  generationStatus: true,
  isInstrumental: true,
  createdAt: true,
} as const;

export function toVariationRow(song: Song): VariationRow {
  return {
    id: song.id,
    title: song.title,
    prompt: song.prompt,
    tags: song.tags,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl,
    duration: song.duration,
    lyrics: song.lyrics,
    generationStatus: song.generationStatus,
    isInstrumental: song.isInstrumental,
    createdAt: song.createdAt,
  };
}
