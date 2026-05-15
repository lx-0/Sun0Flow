import { z } from "zod";
import { NextResponse } from "next/server";
import { CacheControl } from "@/lib/cache";
import { authRoute } from "@/lib/route-handler";
import { querySongLibrary, type SortField } from "@/lib/songs";
import {
  zTrimmedParam,
  zIntParam,
  zCsvParam,
  zBoolParam,
  zCursorParam,
  zEnumParam,
} from "@/lib/query-params";

const SORT_FIELDS: readonly SortField[] = [
  "newest",
  "oldest",
  "highest_rated",
  "most_played",
  "recently_modified",
  "title_az",
];

const songsQuery = z
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

export const GET = authRoute(
  async (_request, { auth, query }) => {
    const result = await querySongLibrary({ userId: auth.userId, ...query });

    return NextResponse.json(result, {
      headers: { "Cache-Control": CacheControl.privateNoCache },
    });
  },
  { route: "/api/songs", query: songsQuery },
);
