import { prisma } from "@/lib/prisma";
import { SongFilters } from "@/lib/songs";
import { parseTags } from "@/lib/tags";

/* ── Public types ─────────────────────────────────────────────── */

export interface RadioSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  tags: string | null;
}

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

/* ── Curation ────────────────────────────────────────────────── */

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

  let filter = SongFilters.discoverable();
  filter = SongFilters.withTagFilters(filter, genre || undefined, mood || undefined);
  filter = SongFilters.withTempoRange(filter, options.tempoMin, options.tempoMax);
  filter = SongFilters.withExcludeIds(filter, excludeIds);

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
