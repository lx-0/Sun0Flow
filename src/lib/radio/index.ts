import { prisma } from "@/lib/prisma";
import { deriveSeedCriteria } from "./derive-seed";
import { buildRadioFilter } from "./build-filter";
import { curateResults } from "./curate";

export type { SeedCriteria } from "./derive-seed";
export type { RadioCriteria } from "./build-filter";
export type { RadioSong } from "./curate";

export interface RadioOptions {
  userId: string;
  mood?: string;
  genre?: string;
  tempoMin?: number;
  tempoMax?: number;
  excludeIds?: string[];
  seedSongId?: string;
  limit?: number;
}

export interface RadioResult {
  songs: Array<{
    id: string;
    title: string | null;
    audioUrl: string;
    imageUrl: string | null;
    duration: number | null;
    lyrics: string | null;
  }>;
  mood: string | null;
  genre: string | null;
  total: number;
}

const SONG_SELECT = {
  id: true,
  title: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
  lyrics: true,
  tags: true,
} as const;

export async function curateRadio(
  options: RadioOptions,
): Promise<RadioResult> {
  const { userId, excludeIds = [], seedSongId, limit = 20 } = options;
  let mood = options.mood?.trim().toLowerCase() || "";
  let genre = options.genre?.trim().toLowerCase() || "";

  if (seedSongId && !mood && !genre) {
    const seed = await deriveSeedCriteria(seedSongId, userId);
    mood = seed.mood;
    genre = seed.genre;
  }

  const filter = buildRadioFilter({
    mood,
    genre,
    tempoMin: options.tempoMin,
    tempoMax: options.tempoMax,
    excludeIds,
  });

  const [userSongs, publicSongs] = await Promise.all([
    prisma.song.findMany({
      where: { ...filter, userId, isHidden: false },
      select: SONG_SELECT,
      take: 60,
    }),
    prisma.song.findMany({
      where: {
        ...filter,
        isPublic: true,
        isHidden: false,
        userId: { not: userId },
      },
      select: SONG_SELECT,
      take: 60,
      orderBy: { playCount: "desc" },
    }),
  ]);

  const curated = curateResults(userSongs, publicSongs, limit);

  return {
    songs: curated.map((s) => ({
      id: s.id,
      title: s.title,
      audioUrl: s.audioUrl!,
      imageUrl: s.imageUrl,
      duration: s.duration,
      lyrics: s.lyrics,
    })),
    mood: mood || null,
    genre: genre || null,
    total: curated.length,
  };
}
