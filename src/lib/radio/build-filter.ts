import { Prisma } from "@prisma/client";

export interface RadioCriteria {
  mood: string;
  genre: string;
  tempoMin?: number;
  tempoMax?: number;
  excludeIds: string[];
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
