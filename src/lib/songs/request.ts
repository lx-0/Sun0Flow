import { z } from "zod";
import type { PublicSongSort, SortField } from "@/lib/songs";
import {
  zBoolParam,
  zCsvParam,
  zCursorParam,
  zEnumParam,
  zIntParam,
  zTrimmedParam,
} from "@/lib/query-params";

const SORT_FIELDS: readonly SortField[] = [
  "newest",
  "oldest",
  "highest_rated",
  "most_played",
  "recently_modified",
  "title_az",
];

export const songsQuerySchema = z
  .object({
    q: zTrimmedParam,
    status: zTrimmedParam,
    minRating: zIntParam,
    sortBy: zEnumParam(SORT_FIELDS, "newest"),
    sortDir: z
      .string()
      .optional()
      .transform(
        (v): "asc" | "desc" | undefined =>
          v === "asc" || v === "desc" ? v : undefined,
      ),
    dateFrom: zTrimmedParam,
    dateTo: zTrimmedParam,
    tagId: z.string().optional(),
    tagIds: zCsvParam,
    genre: zCsvParam,
    mood: zCsvParam,
    tempoMin: zIntParam,
    tempoMax: zIntParam,
    smartFilter: zTrimmedParam,
    includeVariations: zBoolParam,
    archived: zBoolParam,
    limit: zIntParam,
    cursor: zCursorParam,
  })
  .transform(({ q, tagId, tagIds, genre, mood, ...rest }) => ({
    ...rest,
    search: q,
    tagIds: tagIds.length > 0 ? tagIds : tagId ? [tagId] : [],
    genres: genre,
    moods: mood,
  }));

export const publicSongsQuerySchema = z.object({
  q: zTrimmedParam,
  genre: zTrimmedParam,
  mood: zTrimmedParam,
  sort: zEnumParam(["newest", "popular", "trending"] as const, "newest"),
  limit: zIntParam,
  offset: zIntParam,
});

type PublicSongsQueryInput = z.infer<typeof publicSongsQuerySchema>;

export function toPublicSongsQuery(query: PublicSongsQueryInput): {
  search: string | undefined;
  genre: string | undefined;
  mood: string | undefined;
  sort: PublicSongSort;
  limit: number | undefined;
  offset: number | undefined;
} {
  return {
    search: query.q || undefined,
    genre: query.genre || undefined,
    mood: query.mood || undefined,
    sort: query.sort as PublicSongSort,
    limit: query.limit || undefined,
    offset: query.offset || undefined,
  };
}
