import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

export interface GenerationFilter {
  status?: string;
  source?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  cursor?: string;
}

export interface GenerationSummary {
  id: string;
  title: string | null;
  prompt: string | null;
  tags: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  generationStatus: string | null;
  errorMessage: string | null;
  isInstrumental: boolean;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerationListResult {
  songs: GenerationSummary[];
  nextCursor: string | null;
  total: number;
}

const GENERATION_SELECT = {
  id: true,
  title: true,
  prompt: true,
  tags: true,
  audioUrl: true,
  imageUrl: true,
  duration: true,
  generationStatus: true,
  errorMessage: true,
  isInstrumental: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SongSelect;

function buildWhere(
  userId: string,
  filter: GenerationFilter,
): Prisma.SongWhereInput {
  const where: Prisma.SongWhereInput = { userId };
  const and: Prisma.SongWhereInput[] = [];

  if (filter.status && filter.status !== "all") {
    (where as Record<string, unknown>).generationStatus = filter.status;
  }

  if (filter.source && filter.source !== "all") {
    (where as Record<string, unknown>).source = filter.source;
  }

  if (filter.q && filter.q.length >= 2) {
    and.push({ prompt: { contains: filter.q, mode: "insensitive" } });
  }

  if (filter.dateFrom || filter.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (filter.dateFrom) createdAt.gte = new Date(filter.dateFrom);
    if (filter.dateTo) {
      const end = new Date(filter.dateTo);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
    and.push({ createdAt });
  }

  if (filter.cursor) {
    and.push({ createdAt: { lt: new Date(filter.cursor) } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

function buildCountWhere(
  userId: string,
  filter: GenerationFilter,
): Prisma.SongWhereInput {
  return buildWhere(userId, { ...filter, cursor: undefined });
}

export async function queryGenerations(
  userId: string,
  filter: GenerationFilter,
): Promise<GenerationListResult> {
  const where = buildWhere(userId, filter);
  const countWhere = buildCountWhere(userId, filter);
  const orderBy: Prisma.SongOrderByWithRelationInput =
    filter.sortBy === "oldest"
      ? { createdAt: "asc" }
      : { createdAt: "desc" };

  const [songs, total] = await Promise.all([
    prisma.song.findMany({
      where,
      orderBy,
      take: PAGE_SIZE + 1,
      select: GENERATION_SELECT,
    }),
    prisma.song.count({ where: countWhere }),
  ]);

  const hasMore = songs.length > PAGE_SIZE;
  const page = hasMore ? songs.slice(0, PAGE_SIZE) : songs;
  const nextCursor = hasMore
    ? page[page.length - 1]?.createdAt?.toISOString()
    : null;

  return { songs: page, nextCursor, total };
}
