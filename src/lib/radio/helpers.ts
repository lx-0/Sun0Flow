import { Prisma } from "@prisma/client";

export interface RadioCriteria {
  mood: string;
  genre: string;
  tempoMin?: number;
  tempoMax?: number;
  excludeIds: string[];
}

export interface RadioSong {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  tags: string | null;
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
