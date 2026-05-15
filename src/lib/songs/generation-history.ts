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

function parseValidDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateRangeFilter(filter: GenerationFilter): Prisma.SongWhereInput | null {
  const from = parseValidDate(filter.dateFrom);
  const to = parseValidDate(filter.dateTo);
  if (!from && !to) return null;

  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = from;
  if (to) {
    to.setHours(23, 59, 59, 999);
    createdAt.lte = to;
  }
  return { createdAt };
}

function buildSearchFilter(filter: GenerationFilter): Prisma.SongWhereInput | null {
  if (!filter.q || filter.q.length < 2) return null;
  return { prompt: { contains: filter.q, mode: "insensitive" } };
}

function buildCursorFilter(filter: GenerationFilter): Prisma.SongWhereInput | null {
  const cursor = parseValidDate(filter.cursor);
  if (!cursor) return null;
  return { createdAt: { lt: cursor } };
}

export function buildGenerationWhere(userId: string, filter: GenerationFilter): Prisma.SongWhereInput {
  const and: Prisma.SongWhereInput[] = [];
  const searchFilter = buildSearchFilter(filter);
  const dateRangeFilter = buildDateRangeFilter(filter);
  const cursorFilter = buildCursorFilter(filter);

  if (searchFilter) and.push(searchFilter);
  if (dateRangeFilter) and.push(dateRangeFilter);
  if (cursorFilter) and.push(cursorFilter);

  return {
    userId,
    ...(filter.status && filter.status !== "all" ? { generationStatus: filter.status } : {}),
    ...(filter.source && filter.source !== "all" ? { source: filter.source } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function buildCountWhere(userId: string, filter: GenerationFilter): Prisma.SongWhereInput {
  return buildGenerationWhere(userId, { ...filter, cursor: undefined });
}

export async function queryGenerations(
  userId: string,
  filter: GenerationFilter,
): Promise<GenerationListResult> {
  const where = buildGenerationWhere(userId, filter);
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
