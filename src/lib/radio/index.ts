import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTags } from "@/lib/tags";

/* ── Public types ─────────────────────────────────────────────── */

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

/* ── Internal types ───────────────────────────────────────────── */

interface RadioSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  tags: string | null;
}

interface RadioCriteria {
  mood: string;
  genre: string;
  tempoMin?: number;
  tempoMax?: number;
  excludeIds: string[];
}

/* ── Constants ────────────────────────────────────────────────── */

const MOOD_KEYWORDS = new Set([
  "energetic", "chill", "dark", "uplifting", "melancholic", "aggressive",
  "relaxed", "happy", "sad", "epic", "dreamy", "intense", "romantic",
  "mysterious", "peaceful", "angry", "nostalgic", "euphoric", "somber",
  "atmospheric", "hypnotic", "groovy", "emotional", "powerful", "calm",
  "experimental",
]);

const SONG_SELECT = {
  id: true,
  title: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
  lyrics: true,
  tags: true,
} as const;

/* ── Private helpers ──────────────────────────────────────────── */

async function deriveSeedCriteria(
  seedSongId: string,
  userId: string,
): Promise<{ mood: string; genre: string }> {
  const seed = await prisma.song.findFirst({
    where: {
      id: seedSongId,
      OR: [{ userId }, { isPublic: true }],
      generationStatus: "ready",
    },
    select: { tags: true },
  });

  if (!seed?.tags) return { mood: "", genre: "" };

  const tags = parseTags(seed.tags);
  return {
    mood: tags.find((t) => MOOD_KEYWORDS.has(t)) || "",
    genre: tags.find((t) => !MOOD_KEYWORDS.has(t) && t.length > 2) || "",
  };
}

export function buildRadioFilter(
  criteria: RadioCriteria,
): Prisma.SongWhereInput {
  const tagConditions: Prisma.SongWhereInput[] = [];
  if (criteria.mood) {
    tagConditions.push({
      tags: { contains: criteria.mood, mode: "insensitive" },
    });
  }
  if (criteria.genre) {
    tagConditions.push({
      tags: { contains: criteria.genre, mode: "insensitive" },
    });
  }

  const tempoFilter: Prisma.IntNullableFilter | undefined =
    criteria.tempoMin || criteria.tempoMax
      ? {
          ...(criteria.tempoMin ? { gte: criteria.tempoMin } : {}),
          ...(criteria.tempoMax ? { lte: criteria.tempoMax } : {}),
        }
      : undefined;

  return {
    generationStatus: "ready",
    audioUrl: { not: null },
    archivedAt: null,
    ...(criteria.excludeIds.length > 0
      ? { id: { notIn: criteria.excludeIds } }
      : {}),
    ...(tempoFilter ? { tempo: tempoFilter } : {}),
    ...(tagConditions.length === 1 ? tagConditions[0] : {}),
    ...(tagConditions.length > 1 ? { AND: tagConditions } : {}),
  };
}

export function curateResults(
  userSongs: RadioSong[],
  publicSongs: RadioSong[],
  limit: number,
): RadioSong[] {
  const seen = new Set<string>();
  const merged: RadioSong[] = [];
  for (const s of [...userSongs, ...publicSongs]) {
    if (!seen.has(s.id) && s.audioUrl) {
      seen.add(s.id);
      merged.push(s);
    }
  }

  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [merged[i], merged[j]] = [merged[j], merged[i]];
  }

  return merged.slice(0, limit);
}

/* ── Public entry point ───────────────────────────────────────── */

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
